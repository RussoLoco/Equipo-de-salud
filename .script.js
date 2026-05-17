const fs = require('fs');
let content = fs.readFileSync('src/components/UserManagement.tsx', 'utf8');

content = content.replace(
  `u.role === 'odontologo' ? "bg-teal-100 text-teal-700 shadow-sm" :`,
  `u.role === 'odontologo' ? "bg-teal-100 text-teal-700 shadow-sm" :\n                     u.role === 'receso' ? "bg-slate-200 text-slate-700 shadow-sm" :`
);

content = content.replace(
  `u.role === 'odontologo' ? 'Odontología' :`,
  `u.role === 'odontologo' ? 'Odontología' :\n                      u.role === 'receso' ? 'Receso Temporal' :`
);

fs.writeFileSync('src/components/UserManagement.tsx', content);
