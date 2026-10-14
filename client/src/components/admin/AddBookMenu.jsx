import { Link } from 'react-router-dom';
import { Dropdown } from 'react-bootstrap';
import { BookPlus, FileSpreadsheet } from 'lucide-react';

// Primary call-to-action: "Add book" with a dropdown for the two ways to add books
export default function AddBookMenu() {
  return (
    <Dropdown align="end">
      <Dropdown.Toggle variant="primary" id="add-book-menu">
        Add book
      </Dropdown.Toggle>
      <Dropdown.Menu className="add-book-menu">
        <Dropdown.Item as={Link} to="/admin/books/new">
          <BookPlus size={20} aria-hidden="true" />
          <span>
            <strong>Single book</strong>
            <small>Type in the details of one title</small>
          </span>
        </Dropdown.Item>
        <Dropdown.Item as={Link} to="/admin/books/import">
          <FileSpreadsheet size={20} aria-hidden="true" />
          <span>
            <strong>Bulk upload</strong>
            <small>Import many books from a CSV or Excel file</small>
          </span>
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
