// Library rules in ONE place (used by lending, requests, the member portal and the seed).
// Changing a number here changes it everywhere on the server. The client has the same numbers in
// client/src/utils/transactions.js.
module.exports = {
  LOAN_DAYS: 14,          // a borrowed book must be returned by the end of the 14th day
  RENEW_DAYS: 7,          // one extension adds 7 days to the current return date
  MAX_RENEWALS: 2,        // at most 2 extensions per transaction
  MAX_ACTIVE_LOANS: 5,    // borrowed books + pending requests may never exceed 5 per member
  REQUEST_DAYS: 3,        // a pending request expires at the end of the 3rd day
  MAX_BOOKMARKS: 200,     // bookmarks per member
};
