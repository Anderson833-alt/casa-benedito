// Authentication State
let enteredPin = '';
const lockScreenEl = document.getElementById('lockScreen');
const pinErrorEl = document.getElementById('pinError');
const dots = [
  document.getElementById('dot1'),
  document.getElementById('dot2'),
  document.getElementById('dot3'),
  document.getElementById('dot4')
];

function updatePinDots() {
  dots.forEach((dot, index) => {
    if (index < enteredPin.length) {
      dot.classList.add('filled');
    } else {
      dot.classList.remove('filled');
    }
  });
}

function pressKey(num) {
  if (enteredPin.length < 4) {
    enteredPin += num;
    updatePinDots();
    pinErrorEl.classList.remove('visible');

    if (enteredPin.length === 4) {
      setTimeout(verifyPin, 150);
    }
  }
}

function clearPin() {
  enteredPin = '';
  updatePinDots();
  pinErrorEl.classList.remove('visible');
}

function backspacePin() {
  if (enteredPin.length > 0) {
    enteredPin = enteredPin.slice(0, -1);
    updatePinDots();
    pinErrorEl.classList.remove('visible');
  }
}

async function verifyPin() {
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: enteredPin })
    });
    const data = await res.json();
    if (data.authenticated) {
      localStorage.setItem('benedito_token', data.token);
      lockScreenEl.classList.add('unlocked');
      clearPin();
      loadDevices();
    } else {
      pinErrorEl.classList.add('visible');
      setTimeout(clearPin, 600);
    }
  } catch (err) {
    pinErrorEl.classList.add('visible');
    setTimeout(clearPin, 600);
  }
}

function lockPanel() {
  localStorage.removeItem('benedito_token');
  lockScreenEl.classList.remove('unlocked');
  clearPin();
}

document.getElementById('btnLock').addEventListener('click', lockPanel);

// Check if already authenticated
if (localStorage.getItem('benedito_token')) {
  lockScreenEl.classList.add('unlocked');
}

// State
let devices = [];
let currentTab = 'all';
let idleTimer = null;
const IDLE_TIMEOUT_MS = 120000; // 2 min screensaver

// Elements
const clockEl = document.getElementById('clock');
const dateEl = document.getElementById('date');
const ssClockEl = document.getElementById('ssClock');
const ssDateEl = document.getElementById('ssDate');
const screensaverEl = document.getElementById('screensaver');
const devicesGridEl = document.getElementById('devicesGrid');
const toastEl = document.getElementById('toast');
const totalCountEl = document.getElementById('totalCount');

// Update Clock & Date
function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  clockEl.textContent = timeStr;
  ssClockEl.textContent = timeStr;

  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  const dateStr = now.toLocaleDateString('pt-BR', options);
  const formattedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  dateEl.textContent = formattedDate;
  ssDateEl.textContent = formattedDate;
}
setInterval(updateClock, 1000);
updateClock();

// Toast helper
let toastTimer = null;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2500);
}

// Update 3D Interactive House Visual
function updateHouseVisual() {
  const houseCard = document.getElementById('houseCard');
  if (!houseCard) return;

  const houseStatusTag = document.getElementById('houseStatusTag');
  const houseStatusText = document.getElementById('houseStatusText');
  const hfbBtnText = document.getElementById('hfbBtnText');
  const hfbBtnIcon = document.getElementById('hfbBtnIcon');

  // Verifica se qualquer iluminação está acesa (Sala, Cozinha, Gramado, etc.)
  const lightDevices = devices.filter(d => d.type === 'light');
  const isAnyLightOn = lightDevices.some(d => d.state === true || d.state === 'on');

  if (isAnyLightOn) {
    houseCard.classList.add('lighting-on');
    if (houseStatusTag) houseStatusTag.classList.add('active');
    if (houseStatusText) houseStatusText.textContent = 'Luzes Acesas (Casa Colorida)';
    if (hfbBtnText) hfbBtnText.textContent = 'Apagar Luzes';
    if (hfbBtnIcon) hfbBtnIcon.textContent = '🌙';
  } else {
    houseCard.classList.remove('lighting-on');
    if (houseStatusTag) houseStatusTag.classList.remove('active');
    if (houseStatusText) houseStatusText.textContent = 'Luzes Apagadas (Modo Cinza)';
    if (hfbBtnText) hfbBtnText.textContent = 'Ligar Luzes';
    if (hfbBtnIcon) hfbBtnIcon.textContent = '💡';
  }

  // Atualiza estados dos Hotspots interativos sobre a imagem 3D
  const sala = devices.find(d => d.name.toLowerCase().includes('sala'));
  const pinSala = document.getElementById('pinSala');
  if (pinSala && sala) {
    pinSala.classList.toggle('active', !!sala.state);
  }

  const gramado = devices.find(d => d.name.toLowerCase().includes('gramado'));
  const pinGramado = document.getElementById('pinGramado');
  if (pinGramado && gramado) {
    pinGramado.classList.toggle('active', !!gramado.state);
  }

  const heat = devices.find(d => d.name.toLowerCase().includes('heat'));
  const pinPiscina = document.getElementById('pinPiscina');
  if (pinPiscina && heat) {
    pinPiscina.classList.toggle('active', !!heat.state);
  }

  const porteira = devices.find(d => d.name.toUpperCase().includes('PORTEIRA'));
  const pinPorteira = document.getElementById('pinPorteira');
  if (pinPorteira && porteira) {
    pinPorteira.classList.toggle('active', !!porteira.state);
  }
}

// Alternar toda a iluminação (Colorido <-> Cinza)
async function toggleAllLighting() {
  const token = localStorage.getItem('benedito_token');
  const lightDevices = devices.filter(d => d.type === 'light');
  const isAnyLightOn = lightDevices.some(d => d.state === true || d.state === 'on');
  const targetState = !isAnyLightOn;

  lightDevices.forEach(d => {
    d.state = targetState;
  });

  renderDevices();
  updateQuickActionStates();
  updateHouseVisual();

  showToast(targetState ? 'Iluminação Ligada: Casa Colorida!' : 'Iluminação Apagada: Casa em Cinza');

  try {
    for (const d of lightDevices) {
      await fetch(`/api/device/${d.id}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
  } catch (err) {
    console.error('Erro ao alternar iluminação:', err);
  }
}

// Disparar ação da porteira a partir do pino na planta 3D
function triggerPorteiraPulse() {
  const gateBtn = document.getElementById('actionGate');
  if (gateBtn) {
    gateBtn.click();
  }
}

// Fetch Devices
async function loadDevices() {
  const token = localStorage.getItem('benedito_token');
  try {
    const res = await fetch('/api/devices', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) {
      lockPanel();
      return;
    }
    const data = await res.json();
    if (data.devices) {
      devices = data.devices;
      totalCountEl.textContent = devices.length;
      renderDevices();
      updateQuickActionStates();
      updateHouseVisual();
    }
  } catch (err) {
    console.error('Erro ao carregar dispositivos:', err);
  }
}

// Render Device Cards
function renderDevices() {
  devicesGridEl.innerHTML = '';

  const filtered = devices.filter(dev => {
    if (currentTab === 'all') return true;
    return dev.group === currentTab;
  });

  filtered.forEach(dev => {
    const card = document.createElement('div');
    const isOnline = dev.online;
    const isActive = dev.state === true || dev.state === 'on';

    card.className = `device-card ${isOnline ? 'online' : 'offline'} ${isActive ? 'active-state' : ''}`;

    let controlsHtml = '';
    if (dev.type === 'climate') {
      controlsHtml = `
        <div class="climate-info-row">
          <span class="badge-sub">Atual: <strong>${dev.temp_current || 25}°C</strong></span>
          <span class="badge-sub">Modo: <strong>${(dev.mode || 'eco').toUpperCase()}</strong></span>
        </div>
        <div class="heatpump-controls">
          <button class="temp-btn" onclick="adjustTemp('${dev.id}', -1)">-</button>
          <span class="temp-val">${dev.temp || 30}°C</span>
          <button class="temp-btn" onclick="adjustTemp('${dev.id}', 1)">+</button>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="card-top">
        <div class="device-icon-box">${dev.icon || '⚡'}</div>
        <span class="status-pill ${isOnline ? 'online' : 'offline'}">
          ${isOnline ? 'Conectado' : 'Offline'}
        </span>
      </div>

      <div class="card-middle">
        <div class="device-name">${dev.name}</div>
        <div class="device-category">${dev.room || 'Casa'} • ${dev.categoryLabel}</div>
        ${controlsHtml}
      </div>

      <div class="card-bottom">
        <span class="state-label">${dev.type === 'gate' ? (dev.state ? 'Aberta' : 'Fechada') : (isActive ? 'Ligado' : 'Desligado')}</span>
        <div class="touch-switch ${isActive ? 'active' : ''}" onclick="toggleDevice('${dev.id}')"></div>
      </div>
    `;

    devicesGridEl.appendChild(card);
  });
}

// Toggle Device State
async function toggleDevice(id) {
  const token = localStorage.getItem('benedito_token');
  const dev = devices.find(d => d.id === id);
  if (!dev) return;

  dev.state = !dev.state;
  renderDevices();
  updateQuickActionStates();
  updateHouseVisual();

  showToast(`${dev.name}: ${dev.state ? 'Ligando...' : 'Desligando...'}`);

  try {
    const res = await fetch(`/api/device/${id}/toggle`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await res.json();
    if (result.device) {
      Object.assign(dev, result.device);
      renderDevices();
      updateQuickActionStates();
      updateHouseVisual();
    }
  } catch (err) {
    console.error('Falha ao enviar comando:', err);
  }
}

// Adjust Heat Pump Temp
async function adjustTemp(id, delta) {
  const token = localStorage.getItem('benedito_token');
  const dev = devices.find(d => d.id === id);
  if (!dev) return;

  dev.temp = (dev.temp || 30) + delta;
  renderDevices();
  showToast(`${dev.name}: Alvo ajustado para ${dev.temp}°C`);

  try {
    await fetch(`/api/device/${id}/set`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ temp: dev.temp })
    });
  } catch (err) {
    console.error('Erro ao definir temperatura:', err);
  }
}

// Update Quick Actions Buttons
function updateQuickActionStates() {
  const sala = devices.find(d => d.name.toLowerCase().includes('sala'));
  if (sala) {
    document.getElementById('salaSub').textContent = sala.state ? 'Ligada' : 'Desligada';
  }

  const gramado = devices.find(d => d.name.toLowerCase().includes('gramado'));
  if (gramado) {
    document.getElementById('gramadoSub').textContent = gramado.state ? 'Ligado' : 'Desligado';
  }

  const heat = devices.find(d => d.name.toLowerCase().includes('heat'));
  if (heat) {
    document.getElementById('heatSub').textContent = heat.state ? `${heat.temp || 30}°C (Ativa)` : 'Desligada';
  }
}

// Quick Actions Listeners
document.getElementById('actionGate').addEventListener('click', async () => {
  const token = localStorage.getItem('benedito_token');
  const porteira = devices.find(d => d.name.toUpperCase().includes('PORTEIRA'));
  const gateSub = document.getElementById('gateSub');
  
  gateSub.textContent = 'Acionando...';
  showToast('Porteira: Comando de Abertura Enviado!');

  if (porteira) {
    porteira.state = true;
    renderDevices();
    updateHouseVisual();
  }

  try {
    if (porteira) {
      await fetch(`/api/device/${porteira.id}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
  } catch (e) {}

  setTimeout(() => {
    gateSub.textContent = 'Aberta';
    setTimeout(() => {
      if (porteira) porteira.state = false;
      gateSub.textContent = 'Fechada';
      renderDevices();
      updateHouseVisual();
    }, 4000);
  }, 1000);
});

document.getElementById('actionSalaLight').addEventListener('click', () => {
  const sala = devices.find(d => d.name.toLowerCase().includes('sala'));
  if (sala) toggleDevice(sala.id);
});

document.getElementById('actionGramado').addEventListener('click', () => {
  const gramado = devices.find(d => d.name.toLowerCase().includes('gramado'));
  if (gramado) toggleDevice(gramado.id);
});

document.getElementById('actionHeatPump').addEventListener('click', () => {
  const heat = devices.find(d => d.name.toLowerCase().includes('heat'));
  if (heat) toggleDevice(heat.id);
});

document.getElementById('actionAllOff').addEventListener('click', async () => {
  const token = localStorage.getItem('benedito_token');
  devices.forEach(d => {
    if (d.type !== 'gate') d.state = false;
  });
  renderDevices();
  updateQuickActionStates();
  updateHouseVisual();
  showToast('Modo Dormir: Todas as luzes desligadas');

  try {
    await fetch('/api/scene/all-off', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch (e) {}
});

// Category Navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.getAttribute('data-tab');
    renderDevices();
  });
});

// Clique na planta 3D da casa para alternar entre Cinza e Colorido
const houseCardEl = document.getElementById('houseCard');
if (houseCardEl) {
  houseCardEl.addEventListener('click', (e) => {
    if (!e.target.closest('.hotspot') && !e.target.closest('.house-floating-banner')) {
      toggleAllLighting();
    }
  });
}

// Fullscreen
document.getElementById('btnFullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// Screensaver Logic
function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    screensaverEl.classList.add('active');
  }, IDLE_TIMEOUT_MS);
}

document.getElementById('btnScreensaver').addEventListener('click', () => {
  screensaverEl.classList.add('active');
});

screensaverEl.addEventListener('click', () => {
  screensaverEl.classList.remove('active');
  resetIdleTimer();
});

['touchstart', 'click', 'mousemove', 'keydown'].forEach(evt => {
  window.addEventListener(evt, resetIdleTimer, { passive: true });
});
resetIdleTimer();

// Initial load & Polling
loadDevices();
setInterval(loadDevices, 4000);
