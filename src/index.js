// KIP · src/index.js
// Punto de entrada — crea el servidor Express y arranca la escucha

import app from './app.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 KIP Backend corriendo en http://localhost:${PORT}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   API:     http://localhost:${PORT}/api/v1\n`);
});
