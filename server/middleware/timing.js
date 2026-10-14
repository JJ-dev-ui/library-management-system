// DEV-ONLY request timer: prints "GET /api/books?search=x 200 12.3 ms" for every request.
// res.on('finish') fires after the response is sent, so the time includes the database work.
// process.hrtime.bigint() is a high-precision clock (nanoseconds).
module.exports = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)} ms`);
  });
  next();
};
