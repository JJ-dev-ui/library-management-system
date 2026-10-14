require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

// The app runs behind ONE proxy in production (e.g. Render/Vercel). This makes req.ip the real
// client IP from the X-Forwarded-For header (used for the login activity log), and the rate
// limiter counts per real user instead of per proxy.
app.set('trust proxy', 1);

// Dev-only: log how long each request takes (never in production, it would flood the logs)
if (process.env.NODE_ENV !== 'production') app.use(require('./middleware/timing'));

// Security middleware
app.use(helmet());
// exposedHeaders: lets the website read the file name (Content-Disposition) and row count of an export
// even when the website and the API are on different domains
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', exposedHeaders: ['Content-Disposition', 'X-Export-Count'] }));
// JSON bodies are limited to 10 KB everywhere (protects the server from huge requests), EXCEPT the
// two routes that legitimately send more: an export with up to 10,000 selected ids, and a bulk import.
// Those routes add their own, larger express.json() limit.
const BIG_JSON_ROUTES = ['/api/export', '/api/books/import/commit'];
const smallJson = express.json({ limit: '10kb' });
app.use((req, res, next) => (BIG_JSON_ROUTES.some((p) => req.path.startsWith(p)) ? next() : smallJson(req, res, next)));
// Rate limits on the endpoints that check passwords live in routes/auth.js:
// login (10 failed per account+IP and 50 failed per IP, per 15 minutes), register (20 per hour per IP)
// and password change (10 per 15 minutes). /me, profile, photo and theme are not limited.

// Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', require('./routes/auth'));
// Bulk import BEFORE /api/books, so /api/books/import/... is not read as /api/books/:id
app.use('/api/books/import', require('./routes/bookImport'));
app.use('/api/books', require('./routes/books'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/users', require('./routes/users'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/avatars', require('./routes/avatars')); // public profile photos (random keys)
app.use('/api/stats', require('./routes/stats'));
app.use('/api/export', require('./routes/export')); // CSV / Excel / PDF downloads (admin only)
// Member portal
app.use('/api/requests', require('./routes/requests')); // borrow requests (members create, librarians decide)
app.use('/api/me', require('./routes/me'));             // the logged-in member's OWN data
app.use('/api', require('./routes/feed'));              // /api/feed and /api/member/highlights

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
