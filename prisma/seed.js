// KIP · prisma/seed.js
// Carga el catálogo de badges al iniciar la base de datos.

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const BADGES = [
  { id: 'b1',  nombre: 'Primera semana',    descripcion: 'Completaste 7 días seguidos. ¡El comienzo de algo grande!', icono: 'gold',   metaValor: 7,   metaTipo: 'racha' },
  { id: 'b2',  nombre: 'Constancia solar',  descripcion: 'Racha de 14 días. El sol sale para quien madruga.',         icono: 'amber',  metaValor: 14,  metaTipo: 'racha' },
  { id: 'b3',  nombre: 'Hábito forjado',    descripcion: '21 días sin parar. La ciencia dice que ya es un hábito.',   icono: 'teal',   metaValor: 21,  metaTipo: 'racha' },
  { id: 'b4',  nombre: 'Mes completo',      descripcion: 'Racha de 30 días. Un mes entero de disciplina.',            icono: 'violet', metaValor: 30,  metaTipo: 'racha' },
  { id: 'b5',  nombre: 'Racha de fuego',    descripcion: 'Racha de 50 días. La llama no se apaga.',                   icono: 'rose',   metaValor: 50,  metaTipo: 'racha' },
  { id: 'b6',  nombre: 'Maestro del hábito',descripcion: '100 días seguidos. Eres un ejemplo a seguir.',              icono: 'green',  metaValor: 100, metaTipo: 'racha' },
  { id: 'b7',  nombre: 'Madrugador',        descripcion: 'Completa un hábito antes de las 8am 5 veces.',              icono: 'amber',  metaValor: 5,   metaTipo: 'madrugador' },
  { id: 'b8',  nombre: 'Multitarea',        descripcion: 'Ten 5 o más hábitos activos al mismo tiempo.',              icono: 'teal',   metaValor: 5,   metaTipo: 'habitos_activos' },
  { id: 'b9',  nombre: 'Sin excusas',       descripcion: 'No pierdas ni un solo día en una semana completa.',         icono: 'violet', metaValor: 7,   metaTipo: 'semana_perfecta' },
  { id: 'b10', nombre: 'Velocista',         descripcion: 'Completa todos tus hábitos antes del mediodía.',            icono: 'gold',   metaValor: 3,   metaTipo: 'antes_mediodia' },
  { id: 'b11', nombre: 'Explorador',        descripcion: 'Crea hábitos en 4 categorías distintas.',                   icono: 'rose',   metaValor: 4,   metaTipo: 'categorias' },
  { id: 'b12', nombre: 'Leyenda',           descripcion: 'Racha de 365 días. Un año entero sin rendirse.',            icono: 'gold',   metaValor: 365, metaTipo: 'racha' },
];

async function main() {
  for (const badge of BADGES) {
    await prisma.badgeDefinition.upsert({
      where:  { id: badge.id },
      update: badge,
      create: badge,
    });
  }
  console.log(`✅ ${BADGES.length} badges sembrados`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
