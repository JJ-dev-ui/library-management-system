import api from '../api';

// The filter options (categories, languages, shelves, year range) change rarely, so they are
// fetched ONCE and shared by every page (Dashboard, Books, Book form). Searching, filtering or
// changing pages never refetches them. After a book is added/edited/deleted, call
// clearFacets() so the next visit gets fresh counts.
let promise = null;

export const getFacets = () => {
  if (!promise) {
    promise = api.get('/books/facets')
      .then((res) => res.data)
      .catch((err) => { promise = null; throw err; }); // failed -> allow a retry next time
  }
  return promise;
};

export const clearFacets = () => { promise = null; };
