import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Form } from 'react-bootstrap';
import Skeleton from 'react-loading-skeleton';
import api, { errMsg } from '../../api';
import { useToast } from '../../context/ToastContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import PageHeader from '../../components/PageHeader';
import LoadingButton from '../../components/LoadingButton';
import ConfirmModal from '../../components/ConfirmModal';
import FieldLimit from '../../components/FieldLimit';
import ListFieldLimit from '../../components/ListFieldLimit';
import CoverEditor from '../../components/books/CoverEditor';
import { languageLabel } from '../../utils/books';
import { clearFacets, getFacets } from '../../utils/facetsCache';
import { BOOK, LANGUAGES, SHELF_RX } from '../../utils/limits';

// Form fields are kept as strings; they are converted to numbers/arrays only when saving
const EMPTY = {
  title: '', subtitle: '', authors: '', isbn: '', category: '', totalCopies: '1', description: '',
  publisher: '', publishedYear: '', pages: '', language: 'English', shelfLocation: '', coverUrl: '', subjects: '',
};

const fromBook = (b) => ({
  title: b.title || '', subtitle: b.subtitle || '', authors: (b.authors || []).join(', '), isbn: b.isbn || '',
  category: b.category || '', totalCopies: String(b.totalCopies ?? 1), description: b.description || '',
  publisher: b.publisher || '', publishedYear: b.publishedYear ? String(b.publishedYear) : '',
  pages: b.pages ? String(b.pages) : '', language: b.language || '', shelfLocation: b.shelfLocation || '',
  coverUrl: b.coverUrl || '', subjects: (b.subjects || []).join(', '),
});

// "+ New category…" option of the category select, and the category length limit (same as the server)
const NEW_CATEGORY = '__new__';
const CATEGORY_MAX = 50;
// "graphic novels" -> "Graphic Novels". Only the FIRST letter of each word changes, so capitals the
// librarian typed stay ("AI Basics"). The server applies the same rule (routes/books.js).
const titleCase = (s) => s.replace(/(^|[\s-])(\p{L})/gu, (m, sep, letter) => sep + letter.toUpperCase());

// "Rizal, Jose ,  " -> ["Rizal", "Jose"]
const splitList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
const cleanIsbn = (s) => s.replace(/[\s-]/g, '').toUpperCase();
const digitsOnly = (s) => s.replace(/\D/g, '');

// Stops typing at the limits of a comma-separated list, like maxLength does for a normal field:
// at most `maxItems` entries (an extra comma is ignored) and each entry at most `maxEach` characters.
// `keep` = entries the book already had (old imported subjects longer than 60 are left untouched).
function clampList(value, maxItems, maxEach, keep = new Set()) {
  return value
    .split(',')
    .slice(0, maxItems)
    .map((part) => {
      const core = part.trim();
      if (core.length <= maxEach || keep.has(core)) return part;
      const lead = part.match(/^\s*/)[0]; // keep the space typed after the comma
      return lead + core.slice(0, maxEach);
    })
    .join(',');
}

const toPayload = (f) => ({
  title: f.title.trim(),
  subtitle: f.subtitle.trim(),
  authors: splitList(f.authors),
  isbn: cleanIsbn(f.isbn),
  category: f.category.trim(),
  totalCopies: Number(f.totalCopies),
  description: f.description.trim(),
  publisher: f.publisher.trim(),
  publishedYear: f.publishedYear ? Number(f.publishedYear) : null, // null = clear the field
  pages: f.pages ? Number(f.pages) : null,
  language: f.language.trim(),
  shelfLocation: f.shelfLocation.trim().toUpperCase(),
  coverUrl: f.coverUrl.trim(),
  subjects: splitList(f.subjects),
});

// The "normalized" form as one string: trimmed text, author/subject arrays, numbers.
// Two forms are the same when these strings are equal -> used to know if there are unsaved changes.
const snapshot = (f) => JSON.stringify(toPayload(f));

// The SAME rules as the server (routes/books.js). `initial` = the book as loaded, because old imported
// values (a language code like "ITA", a subject longer than 60) may stay as they are.
function validate(f, minCopies, initial) {
  const e = {};
  if (!f.title.trim()) e.title = 'Title is required';
  const authors = splitList(f.authors);
  if (authors.length === 0) e.authors = 'Add at least one author';
  else if (authors.length > BOOK.authors) e.authors = `At most ${BOOK.authors} authors`;
  else if (authors.some((a) => a.length > BOOK.author)) e.authors = `Each author name can have at most ${BOOK.author} characters`;
  if (!/^(\d{9}[\dX]|\d{13})$/.test(cleanIsbn(f.isbn))) e.isbn = 'ISBN must be 10 or 13 digits';
  if (!f.category.trim()) e.category = 'Choose a category';
  const copies = Number(f.totalCopies);
  if (!f.totalCopies || copies < 1 || copies > BOOK.copiesMax) e.totalCopies = `Copies must be between 1 and ${BOOK.copiesMax}`;
  else if (copies < minCopies) e.totalCopies = `${minCopies} ${minCopies === 1 ? 'copy is' : 'copies are'} borrowed, so at least ${minCopies} needed`;
  if (f.publishedYear && (f.publishedYear.length !== 4 || Number(f.publishedYear) < BOOK.yearMin || Number(f.publishedYear) > BOOK.yearMax)) {
    e.publishedYear = `Use a year between ${BOOK.yearMin} and ${BOOK.yearMax}`;
  }
  if (f.pages && (Number(f.pages) < 1 || Number(f.pages) > BOOK.pagesMax)) e.pages = `Pages must be between 1 and ${BOOK.pagesMax}`;
  if (f.language && !LANGUAGES.includes(f.language) && f.language !== initial.language) e.language = 'Choose a language from the list';
  const shelf = f.shelfLocation.trim().toUpperCase();
  if (shelf && !SHELF_RX.test(shelf)) e.shelfLocation = 'Use a shelf code like PRG-B4';
  const cover = f.coverUrl.trim();
  if (cover && !/^\/covers\/[\w.-]+$/.test(cover) && !/^https?:\/\/[^\s"'<>]+$/i.test(cover)) e.coverUrl = 'Use a link starting with http:// or https://';
  const subjects = splitList(f.subjects);
  const oldSubjects = new Set(splitList(initial.subjects));
  if (subjects.length > BOOK.subjects) e.subjects = `At most ${BOOK.subjects} subjects`;
  else if (subjects.some((s) => s.length > BOOK.subject && !oldSubjects.has(s))) e.subjects = `Each subject can have at most ${BOOK.subject} characters`;
  return e;
}

// Label + control + inline error + optional help text (+ optional character counter)
function Field({ id, label, error, help, required, children, limit }) {
  return (
    <Form.Group controlId={id}>
      <Form.Label>{label}{required && <span className="text-danger" aria-hidden="true"> *</span>}</Form.Label>
      {children}
      {error ? <div className="invalid-feedback d-block">{error}</div> : help && <Form.Text>{help}</Form.Text>}
      {limit}
    </Form.Group>
  );
}

// Placeholder with the same panels as the real form (edit mode, while the book loads)
function FormSkeleton() {
  const field = (w = '100%') => <div><Skeleton width={90} height={14} /><Skeleton width={w} height={38} borderRadius={8} /></div>;
  return (
    <div className="row g-4" aria-hidden="true">
      <div className="col-lg-8"><div className="panel p-4 d-grid gap-3">{field()}{field()}{field()}{field('60%')}{field()}<Skeleton height={140} borderRadius={8} /></div></div>
      <div className="col-lg-4 d-grid gap-4 align-content-start">
        <div className="panel p-4 d-grid gap-3">{field()}{field()}</div>
        <div className="panel p-4"><Skeleton width={120} height={177} borderRadius={8} className="mb-3" />{field()}</div>
      </div>
    </div>
  );
}

// /admin/books/new and /admin/books/:id/edit
export default function BookForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState(EMPTY);
  const [initial, setInitial] = useState(EMPTY); // the values when the page opened (for "unsaved changes")
  const [book, setBook] = useState(null);        // the saved book (edit mode): _id, hasCustomCover, coverVersion
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [onLoan, setOnLoan] = useState(0);
  const [facets, setFacets] = useState({ categories: [], languages: [] });
  const [pendingCover, setPendingCover] = useState(null); // { blob, url } chosen but not uploaded yet
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [newCategory, setNewCategory] = useState(false); // typing a new category instead of choosing one

  useEffect(() => {
    getFacets().then(setFacets).catch(() => {});
  }, []);

  // Edit mode: load the book into the form
  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    api.get(`/books/${id}`)
      .then((res) => {
        const b = res.data.book;
        setBook(b);
        setForm(fromBook(b));
        setInitial(fromBook(b));
        setOnLoan(Math.max(0, b.totalCopies - b.availableCopies));
      })
      .catch((err) => setServerError(errMsg(err)))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  // Free the preview image memory when it is replaced or the page closes
  useEffect(() => () => { if (pendingCover) URL.revokeObjectURL(pendingCover.url); }, [pendingCover]);

  // Unsaved changes = the normalized form differs from the initial one, or a new photo is waiting
  const fieldsChanged = useMemo(() => snapshot(form) !== snapshot(initial), [form, initial]);
  const dirty = fieldsChanged || !!pendingCover;
  useUnsavedChanges(dirty && !saving); // browser prompt when closing/refreshing with unsaved changes

  const set = (key, clean) => (e) => {
    const value = clean ? clean(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined })); // hide the error once the user edits the field
  };

  const leave = () => (dirty ? setConfirmLeave(true) : navigate('/admin/books'));

  const removeUploadedCover = async () => {
    try {
      const res = await api.delete(`/books/${book._id}/cover`);
      setBook(res.data.book); // hasCustomCover = false -> the preview falls back to the ISBN cover or initials
      toast.success('The uploaded photo was removed');
    } catch (err) {
      toast.error(errMsg(err));
      throw err;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    const found = validate(form, onLoan, initial);
    // A new category may not repeat an existing one with other capitals ("fiction" vs "Fiction")
    if (newCategory && categoryMatch) found.category = `"${categoryMatch}" already exists. Use it instead.`;
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(Object.keys(found)[0])?.focus(); // jump to the first problem
      return;
    }
    setSaving(true);
    const payload = toPayload(form);
    let saved = book;
    try {
      // 1) Save the book details (skipped in edit mode when only the photo changed)
      if (!isEdit) saved = (await api.post('/books', payload)).data.book;
      else if (fieldsChanged) saved = (await api.put(`/books/${id}`, payload)).data.book;
    } catch (err) {
      // Show the server's field errors next to the right inputs
      const fieldErrors = {};
      (err.response?.data?.errors || []).forEach((x) => {
        const key = String(x.path).split('[')[0].split('.')[0];
        if (!fieldErrors[key]) fieldErrors[key] = x.msg;
      });
      if (err.response?.status === 409) fieldErrors.isbn = errMsg(err);
      setErrors(fieldErrors);
      setServerError(errMsg(err));
      toast.error(errMsg(err));
      setSaving(false);
      return;
    }

    // 2) Upload the new photo (a new book must exist first, so this always comes second)
    if (pendingCover) {
      try {
        const fd = new FormData();
        fd.append('cover', pendingCover.blob, 'cover.jpg');
        await api.put(`/books/${saved._id}/cover`, fd);
      } catch (err) {
        clearFacets();
        toast.error(`The book was saved, but the photo upload failed: ${errMsg(err)}`);
        setSaving(false);
        // Stay on the form (now in edit mode) so the librarian can try the upload again
        setBook(saved);
        setInitial(form);
        if (!isEdit) navigate(`/admin/books/${saved._id}/edit`, { replace: true });
        return;
      }
    }

    clearFacets(); // category/language counts changed
    toast.success(isEdit ? `"${payload.title}" was updated` : `"${payload.title}" was added to the catalog`);
    setPendingCover(null);
    setInitial(form); // nothing unsaved any more (so leaving does not ask)
    setSaving(false);
    navigate('/admin/books');
  };

  // The category list comes from the catalog; keep the book's own category even if it is new
  const categoryNames = facets.categories.map((c) => c.name);
  if (!newCategory && form.category && !categoryNames.includes(form.category)) categoryNames.push(form.category);
  // While typing a new category: the existing category it repeats (ignoring capitals), if any
  const typed = form.category.trim().toLowerCase();
  const categoryMatch = newCategory && typed ? categoryNames.find((c) => c.toLowerCase() === typed) : null;

  const chooseCategory = (e) => {
    if (e.target.value === NEW_CATEGORY) {
      setNewCategory(true);
      setForm((f) => ({ ...f, category: '' }));
    } else set('category')(e);
  };
  const pickExistingCategory = (name) => {
    setNewCategory(false);
    setForm((f) => ({ ...f, category: name }));
    setErrors((x) => ({ ...x, category: undefined }));
  };
  const cancelNewCategory = () => pickExistingCategory(initial.category);
  // Old imported language codes (e.g. "ITA") stay selectable for that book only
  const languageOptions = LANGUAGES.includes(initial.language) || !initial.language ? LANGUAGES : [...LANGUAGES, initial.language];

  // Subjects the book already had: an old imported subject longer than 60 characters is not cut
  const oldSubjects = new Set(splitList(initial.subjects));

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit book' : 'Add a book'}
        description={isEdit ? 'Update the catalog details and inventory of this title.' : 'Add one new title to the catalog. All its copies start on the shelf.'}
      >
        <Button variant="outline-secondary" onClick={leave}>
          Back to books
        </Button>
      </PageHeader>

      {serverError && <div className="alert alert-danger" role="alert">{serverError}</div>}

      {loading ? <FormSkeleton /> : (
        <Form onSubmit={handleSubmit} noValidate>
          <div className="row g-4">
            <div className="col-lg-8">
              <section className="panel p-4">
                <h2 className="form-section-title">Book details</h2>
                <div className="d-grid gap-3">
                  <Field id="title" label="Title" error={errors.title} required limit={<FieldLimit value={form.title} max={BOOK.title} />}>
                    <Form.Control value={form.title} onChange={set('title')} maxLength={BOOK.title} isInvalid={!!errors.title} />
                  </Field>
                  <Field id="subtitle" label="Subtitle" error={errors.subtitle} limit={<FieldLimit value={form.subtitle} max={BOOK.subtitle} />}>
                    <Form.Control value={form.subtitle} onChange={set('subtitle')} maxLength={BOOK.subtitle} isInvalid={!!errors.subtitle} />
                  </Field>
                  <Field id="authors" label="Authors" error={errors.authors} required
                    limit={<ListFieldLimit value={form.authors} maxItems={BOOK.authors} maxEach={BOOK.author} noun={['author', 'authors']}
                      help={`Separate several authors with commas (up to ${BOOK.authors}, ${BOOK.author} characters each).`} />}>
                    <Form.Control value={form.authors} onChange={set('authors', (v) => clampList(v, BOOK.authors, BOOK.author))} placeholder="e.g. Jose Rizal" isInvalid={!!errors.authors} />
                  </Field>
                  <div className="row g-3">
                    <div className="col-sm-6">
                      <Field id="isbn" label="ISBN" error={errors.isbn} help="10 or 13 digits; dashes and spaces are removed." required>
                        {/* Only digits, X, dashes and spaces can be typed; at most 17 characters */}
                        <Form.Control value={form.isbn} onChange={set('isbn', (v) => v.replace(/[^\dXx\s-]/g, ''))} inputMode="numeric" maxLength={BOOK.isbnTyped} className="mono" isInvalid={!!errors.isbn} />
                      </Field>
                    </div>
                    <div className="col-sm-6">
                      <Field id="category" label="Category" error={errors.category} required
                        limit={newCategory ? <FieldLimit value={form.category} max={CATEGORY_MAX} /> : null}>
                        {newCategory ? (
                          <div className="d-flex gap-2">
                            {/* Saved in Title Case; typing stops at 50 characters */}
                            <Form.Control value={form.category} onChange={set('category', titleCase)} maxLength={CATEGORY_MAX}
                              placeholder="e.g. Graphic Novels" isInvalid={!!errors.category || !!categoryMatch} autoFocus />
                            <Button variant="outline-secondary" onClick={cancelNewCategory}>Cancel</Button>
                          </div>
                        ) : (
                          <Form.Select value={form.category} onChange={chooseCategory} isInvalid={!!errors.category}>
                            <option value="">Choose a category…</option>
                            {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
                            <option value={NEW_CATEGORY}>+ New category…</option>
                          </Form.Select>
                        )}
                        {categoryMatch && !errors.category && (
                          <div className="small mt-1">
                            &quot;{categoryMatch}&quot; already exists.{' '}
                            <Button variant="link" size="sm" className="p-0 align-baseline" onClick={() => pickExistingCategory(categoryMatch)}>
                              Use &quot;{categoryMatch}&quot;
                            </Button>
                          </div>
                        )}
                      </Field>
                    </div>
                  </div>
                  <div className="row g-3">
                    <div className="col-sm-6">
                      <Field id="publisher" label="Publisher" error={errors.publisher} limit={<FieldLimit value={form.publisher} max={BOOK.publisher} />}>
                        <Form.Control value={form.publisher} onChange={set('publisher')} maxLength={BOOK.publisher} isInvalid={!!errors.publisher} />
                      </Field>
                    </div>
                    <div className="col-6 col-sm-3">
                      <Field id="publishedYear" label="Year" error={errors.publishedYear}>
                        {/* type="text" + digits only + maxLength 4: typing stops at 4 digits (type="number" ignores maxLength) */}
                        <Form.Control value={form.publishedYear} onChange={set('publishedYear', digitsOnly)} inputMode="numeric" maxLength={4} placeholder="YYYY" isInvalid={!!errors.publishedYear} />
                      </Field>
                    </div>
                    <div className="col-6 col-sm-3">
                      <Field id="pages" label="Pages" error={errors.pages}>
                        <Form.Control value={form.pages} onChange={set('pages', digitsOnly)} inputMode="numeric" maxLength={4} isInvalid={!!errors.pages} />
                      </Field>
                    </div>
                  </div>
                  <div className="row g-3">
                    <div className="col-sm-6">
                      <Field id="language" label="Language" error={errors.language}>
                        <Form.Select value={form.language} onChange={set('language')} isInvalid={!!errors.language}>
                          {languageOptions.map((l) => (
                            <option key={l} value={l}>{LANGUAGES.includes(l) ? l : `${languageLabel(l)} (current)`}</option>
                          ))}
                        </Form.Select>
                      </Field>
                    </div>
                    <div className="col-sm-6">
                      <Field id="subjects" label="Subjects" error={errors.subjects}
                        limit={<ListFieldLimit value={form.subjects} maxItems={BOOK.subjects} maxEach={BOOK.subject} noun={['subject', 'subjects']}
                          help={`Separate with commas (up to ${BOOK.subjects}, ${BOOK.subject} characters each).`} />}>
                        <Form.Control value={form.subjects} onChange={set('subjects', (v) => clampList(v, BOOK.subjects, BOOK.subject, oldSubjects))} placeholder="e.g. History, Philippines" isInvalid={!!errors.subjects} />
                      </Field>
                    </div>
                  </div>
                  <Field id="description" label="Description" error={errors.description} limit={<FieldLimit value={form.description} max={BOOK.description} />}>
                    <Form.Control as="textarea" rows={6} value={form.description} onChange={set('description')} maxLength={BOOK.description} isInvalid={!!errors.description} />
                  </Field>
                </div>
              </section>
            </div>

            <div className="col-lg-4 d-grid gap-4 align-content-start">
              <section className="panel p-4">
                <h2 className="form-section-title">Inventory</h2>
                <div className="d-grid gap-3">
                  <Field
                    id="totalCopies"
                    label="Copies owned"
                    error={errors.totalCopies}
                    help={onLoan > 0 ? `${onLoan} borrowed right now, so the minimum is ${onLoan}.` : `Between 1 and ${BOOK.copiesMax}.`}
                    required
                  >
                    <Form.Control value={form.totalCopies} onChange={set('totalCopies', digitsOnly)} inputMode="numeric" maxLength={3} isInvalid={!!errors.totalCopies} />
                  </Field>
                  <Field id="shelfLocation" label="Shelf location" error={errors.shelfLocation} help="Section code, dash, shelf letter and row, e.g. PRG-B4">
                    <Form.Control value={form.shelfLocation} onChange={set('shelfLocation', (v) => v.toUpperCase())} maxLength={BOOK.shelf} className="mono" placeholder="PRG-B4" isInvalid={!!errors.shelfLocation} />
                  </Field>
                </div>
              </section>

              <section className="panel p-4">
                <h2 className="form-section-title">Cover</h2>
                {/* The preview follows the form live: a new photo, the uploaded cover, the URL, or the ISBN cover */}
                <CoverEditor
                  book={{ _id: book?._id, hasCustomCover: book?.hasCustomCover, coverVersion: book?.coverVersion, coverUrl: form.coverUrl.trim(), isbn: form.isbn, title: form.title || 'New book' }}
                  pending={pendingCover}
                  onPick={setPendingCover}
                  onDiscard={() => setPendingCover(null)}
                  onRemoveUploaded={removeUploadedCover}
                  coverUrl={form.coverUrl}
                  onCoverUrlChange={set('coverUrl')}
                  urlError={errors.coverUrl}
                  disabled={saving}
                />
              </section>
            </div>
          </div>

          <div className="d-flex justify-content-end align-items-center gap-3 mt-4">
            {dirty && <span className="dirty-hint">Unsaved changes</span>}
            <Button variant="outline-secondary" onClick={leave} disabled={saving}>Cancel</Button>
            {/* Disabled until something changed, so an untouched form cannot be "saved" */}
            <LoadingButton type="submit" variant="primary" loading={saving} loadingText="Saving..." disabled={!dirty}>
              {isEdit ? 'Save changes' : 'Add book'}
            </LoadingButton>
          </div>
        </Form>
      )}

      <ConfirmModal
        show={confirmLeave}
        title="Discard unsaved changes?"
        message="The changes you made to this book will be lost."
        confirmLabel="Discard changes"
        onConfirm={() => { setConfirmLeave(false); setInitial(form); setPendingCover(null); navigate('/admin/books'); }}
        onCancel={() => setConfirmLeave(false)}
      />
    </>
  );
}
