import { todos } from './todos.js';
export function filterTodos(query, tag) {
  const q = (query ?? '').trim().toLowerCase();
  const t = (tag ?? '').trim().toLowerCase();
  return todos.filter((item) => {
    const tagOk = !t || (item.tag ?? '').toLowerCase() === t;
    const textOk = !q || item.text.toLowerCase().includes(q);
    return tagOk && textOk;
  });
}
