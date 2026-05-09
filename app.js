:root {
  --primary: #00c853;
  --dark: #1a1a1a;
  --text-gray: #757575;
  --shadow: 0 10px 30px rgba(0,0,0,0.12);
}

body { margin: 0; font-family: 'Inter', -apple-system, sans-serif; overflow: hidden; background: #eee; }
#map { height: 100vh; width: 100vw; z-index: 1; }

.search-overlay {
  position: absolute; top: 15px; width: 100%; z-index: 10;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}

.search-bar {
  background: white; width: 90%; padding: 12px 20px; border-radius: 15px;
  display: flex; justify-content: space-between; box-shadow: var(--shadow);
  box-sizing: border-box;
}

.search-bar input { border: none; outline: none; width: 90%; font-size: 1rem; }

/* Carrossel de Combustíveis */
.filter-wrapper {
  width: 100%; overflow-x: auto; display: flex; justify-content: flex-start;
  padding: 5px 20px; box-sizing: border-box;
  -webkit-overflow-scrolling: touch; scrollbar-width: none;
}
.filter-wrapper::-webkit-scrollbar { display: none; }

.filter-group { display: flex; gap: 8px; white-space: nowrap; }

.chip {
  border: 1px solid #ddd; background: white; padding: 10px 18px; border-radius: 50px;
  font-weight: 600; color: #555; font-size: 0.85rem; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  cursor: pointer; transition: 0.2s;
}
.chip.active { background: var(--dark); color: white; border-color: var(--dark); }

/* FAB */
.fab-gps {
  position: absolute; right: 20px; bottom: 150px; z-index: 10;
  width: 56px; height: 56px; border-radius: 28px; border: none;
  background: white; box-shadow: var(--shadow); display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}

/* Bottom Sheet */
.bottom-sheet {
  position: fixed; bottom: 0; width: 100%; background: white; z-index: 20;
  border-radius: 30px 30px 0 0; box-shadow: 0 -10px 40px rgba(0,0,0,0.15);
  transform: translateY(100%); transition: 0.4s cubic-bezier(0.1, 0.7, 0.1, 1);
  box-sizing: border-box;
}
.bottom-sheet.active { transform: translateY(0); }

.drag-handle { width: 40px; height: 5px; background: #ddd; border-radius: 10px; margin: 15px auto; }
.sheet-content { padding: 0 25px 35px 25px; }

.header { display: flex; justify-content: space-between; align-items: flex-start; }
.header h2 { margin: 0; font-size: 1.3rem; color: var(--dark); }
.distance-info { margin: 4px 0; color: var(--text-gray); font-size: 0.85rem; }

.verified-badge {
  background: #e8f5e9; color: #2e7d32; padding: 5px 10px; border-radius: 8px;
  font-size: 0.7rem; font-weight: 800; text-transform: uppercase; display: none;
}

.price-section { background: #f9f9f9; padding: 20px; border-radius: 20px; margin: 20px 0; display: flex; justify-content: space-between; align-items: center; }
.price-label { font-size: 0.8rem; color: var(--text-gray); display: block; font-weight: 600;}
#station-price { margin: 0; font-size: 2.2rem; color: var(--dark); letter-spacing: -1px; }

.update-info { font-size: 0.75rem; color: #999; display: flex; align-items: center; gap: 5px; }
.dot { width: 8px; height: 8px; background: var(--primary); border-radius: 50%; }

.action-buttons { display: flex; gap: 10px; }
.btn-primary { flex: 2; background: var(--primary); color: white; border: none; padding: 18px; border-radius: 15px; font-weight: 700; font-size: 1rem; cursor: pointer; }
.btn-secondary { flex: 1; background: #f0f0f0; border: none; border-radius: 15px; font-weight: 600; color: #444; cursor: pointer; }
