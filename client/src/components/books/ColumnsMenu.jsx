import { Dropdown, Form } from 'react-bootstrap';

// "Columns" menu with a checkbox per optional column.
// autoClose="outside": the menu stays open while ticking boxes, and closes on a click elsewhere.
export default function ColumnsMenu({ columns, visible, onChange }) {
  const toggle = (id) => onChange(visible.includes(id) ? visible.filter((v) => v !== id) : [...visible, id]);

  return (
    <Dropdown autoClose="outside" align="end">
      <Dropdown.Toggle variant="outline-secondary" id="books-columns" className="text-nowrap">
        Columns
      </Dropdown.Toggle>
      <Dropdown.Menu className="columns-menu">
        <Dropdown.Header>Show columns</Dropdown.Header>
        <Form.Check type="checkbox" id="col-book" label="Book (always shown)" checked disabled className="columns-check" />
        {columns.map((c) => (
          <Form.Check
            key={c.id}
            type="checkbox"
            id={`col-${c.id}`}
            label={c.label}
            checked={visible.includes(c.id)}
            onChange={() => toggle(c.id)}
            className="columns-check"
          />
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}
