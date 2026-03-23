import { KIP_EVENTS } from '../../events.js';
/**
 * KIP · HabitModal — modal de creación Y edición de hábitos
 *
 * [FIX-8]  AbortController para evitar listeners duplicados.
 * [FIX-B4] getElementById cacheado en variable local.
 * [B-33]   Nuevo método openEdit(habito) que precarga los datos del hábito,
 *           cambia el título y el botón, y al guardar emite HABITO_EDITADO
 *           en lugar de HABITO_CREADO.
 */
export const HabitModalComponent = {
  _controller: null,
  _editId:     null, // id del hábito en edición, null = modo creación

  init() {
    const modal     = document.getElementById('habit-modal');
    const backdrop  = document.getElementById('modal-backdrop');
    const btnOpen   = document.getElementById('btn-nuevo-habito');
    const btnClose  = document.getElementById('btn-close-modal');
    const btnCancel = document.getElementById('btn-modal-cancel');
    const btnSave   = document.getElementById('btn-modal-save');
    if (!modal) return;

    const elNombre  = document.getElementById('mf-nombre');
    const elNota    = document.getElementById('mf-nota');
    const elMeta    = document.getElementById('mf-meta-num');
    const elMetaRow = document.getElementById('mf-meta-row');
    const elTitle   = document.getElementById('modal-title');
    const elHidId   = document.getElementById('modal-habito-id');

    this.destroy();
    this._controller = new AbortController();
    const { signal } = this._controller;

    const open = () => {
      modal.hidden = false;
      if (backdrop) backdrop.hidden = false;
      elNombre?.focus();
    };

    const close = () => {
      modal.hidden = true;
      if (backdrop) backdrop.hidden = true;
      this._editId = null;
      this._resetForm(elNombre, elNota, elTitle, elHidId, btnSave);
    };

    btnOpen?.addEventListener('click', () => {
      this._editId = null;
      this._resetForm(elNombre, elNota, elTitle, elHidId, btnSave);
      open();
    }, { signal });

    btnClose?.addEventListener('click',  close, { signal });
    btnCancel?.addEventListener('click', close, { signal });
    backdrop?.addEventListener('click',  close, { signal });
    modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { signal });

    btnSave?.addEventListener('click', () => {
      const nombre = elNombre?.value.trim();
      if (!nombre) { elNombre?.focus(); return; }

      const catBtn  = modal.querySelector('.mf-cat-btn.active');
      const freqBtn = modal.querySelector('.mf-freq-btn.active');
      const nota    = elNota?.value.trim() || '';
      const meta    = parseInt(elMeta?.value || '3', 10);

      if (this._editId) {
        // Modo edición → emitir HABITO_EDITADO con los cambios
        window.dispatchEvent(new CustomEvent(KIP_EVENTS.HABITO_EDITADO, {
          detail: {
            id:     this._editId,
            cambios: {
              nombre,
              nota,
              categoria:   catBtn?.dataset.cat   || 'general',
              frecuencia:  freqBtn?.dataset.freq || 'diario',
              metaSemanal: meta,
            },
          },
        }));
      } else {
        // Modo creación → emitir HABITO_CREADO
        window.dispatchEvent(new CustomEvent(KIP_EVENTS.HABITO_CREADO, {
          detail: {
            nombre, nota,
            categoria:   catBtn?.dataset.cat   || 'general',
            frecuencia:  freqBtn?.dataset.freq || 'diario',
            metaSemanal: meta,
          },
        }));
      }
      close();
    }, { signal });

    // Botones de categoría
    modal.querySelectorAll('.mf-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.mf-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }, { signal });
    });

    // Botones de frecuencia + mostrar/ocultar meta
    modal.querySelectorAll('.mf-freq-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.mf-freq-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (elMetaRow) elMetaRow.hidden = btn.dataset.freq !== 'semanal';
      }, { signal });
    });
  },

  /**
   * [B-33] Abre el modal en modo edición precargado con los datos del hábito.
   * @param {object} habito — objeto hábito completo
   */
  openEdit(habito) {
    if (!habito) return;
    const modal = document.getElementById('habit-modal');
    if (!modal) return;

    this._editId = habito.id;

    // Cambiar título y texto del botón
    const elTitle = document.getElementById('modal-title');
    if (elTitle) elTitle.textContent = 'Editar Hábito';

    const btnSave = document.getElementById('btn-modal-save');
    if (btnSave) {
      // Preservar el SVG del botón y cambiar solo el texto
      const svg = btnSave.querySelector('svg');
      btnSave.textContent = '';
      if (svg) btnSave.appendChild(svg);
      btnSave.appendChild(document.createTextNode('Guardar cambios'));
    }

    // Rellenar campos
    const elNombre = document.getElementById('mf-nombre');
    const elNota   = document.getElementById('mf-nota');
    const elMeta   = document.getElementById('mf-meta-num');
    const elMetaRow = document.getElementById('mf-meta-row');
    const elHidId  = document.getElementById('modal-habito-id');

    if (elNombre) elNombre.value = habito.nombre || '';
    if (elNota)   elNota.value   = habito.nota   || '';
    if (elHidId)  elHidId.value  = habito.id;

    // Seleccionar categoría
    const cat = (habito.categoria || 'general').toLowerCase();
    document.querySelectorAll('.mf-cat-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === cat);
    });

    // Seleccionar frecuencia y meta
    const freq = (habito.frecuencia || 'diario').toLowerCase();
    document.querySelectorAll('.mf-freq-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.freq === freq);
    });
    if (elMetaRow) elMetaRow.hidden = freq !== 'semanal';
    if (elMeta && habito.metaSemanal) elMeta.value = String(habito.metaSemanal);

    // Abrir
    const backdrop = document.getElementById('modal-backdrop');
    if (modal)    modal.hidden    = false;
    if (backdrop) backdrop.hidden = false;
    elNombre?.focus();
    elNombre?.select();
  },

  destroy() {
    this._controller?.abort();
    this._controller = null;
  },

  _resetForm(elNombre, elNota, elTitle, elHidId, btnSave) {
    if (elNombre) elNombre.value = '';
    if (elNota)   elNota.value   = '';
    if (elHidId)  elHidId.value  = '';
    if (elTitle)  elTitle.textContent = 'Nuevo Hábito';
    if (btnSave) {
      const svg = btnSave.querySelector('svg');
      btnSave.textContent = '';
      if (svg) btnSave.appendChild(svg);
      btnSave.appendChild(document.createTextNode('Crear hábito'));
    }
    // [E-06] Manipular clases directamente en lugar de .click()
    // .click() dispara listeners que pueden no estar registrados si el
    // AbortController fue abortado entre destroy() y el nuevo init().
    document.querySelectorAll('.mf-cat-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === 'general');
    });
    document.querySelectorAll('.mf-freq-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.freq === 'diario');
    });
    const metaRow = document.getElementById('mf-meta-row');
    if (metaRow) metaRow.hidden = true;
  },
};
