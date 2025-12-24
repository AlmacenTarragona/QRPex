// CONFIGURACIÓN (GOOGLE APPS SCRIPT)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby2wmLDWVOtUOODDo7AFHzTHpBf91mch1SRv4wimwAVy6Exnc7oA5EC_ux4Vhfp492_/exec";

// ELEMENTOS DOM
const setupScreen = document.getElementById('setup-form');
const workspaceScreen = document.getElementById('workspace-container');
const readerElement = document.getElementById('reader');

// Inputs
const installerInput = document.getElementById('installer-code');
const actuationInput = document.getElementById('actuation-code');

// Botones
const startBtn = document.getElementById('start-scan-btn');
const stopBtn = document.getElementById('stop-scan-btn');
const torchBtn = document.getElementById('torch-btn');
const resetBtn = document.getElementById('reset-btn');
const sendBtn = document.getElementById('send-btn');

// Sliders
const zoomRow = document.getElementById('zoom-row');
const zoomSlider = document.getElementById('zoom-slider');
const brightnessSlider = document.getElementById('brightness-slider');
const contrastSlider = document.getElementById('contrast-slider');

// Tabla
const tableBody = document.querySelector('#data-table tbody');
const emptyState = document.getElementById('empty-state');

// ESTADO
let html5QrCode;
let readings = [];
let currentSettings = { installer: '', actuation: '' };
let streamTrack = null;
let capabilities = {};
let isTorchOn = false;
let lastScanned = null;
let lastTime = 0;

// AUDIO CONTEXT (BEEP)
let audioCtx = null;

// INICIO
document.addEventListener('DOMContentLoaded', () => {
    html5QrCode = new Html5Qrcode("reader");
    renderTable(); // Inicializa tabla vacía
});

// LISTENERS
startBtn.addEventListener('click', () => {
    const inst = installerInput.value.trim();
    const act = actuationInput.value.trim();

    if (!inst || !act) {
        showModal("⚠️", "Campos Incompletos", "Por favor, completa el Código de Instalador y el Nº de Actuación.", true, false, 'error');
        return;
    }

    // Validación Técnico (4 dígitos numéricos)
    const techRegex = /^\d{4}$/;
    if (!techRegex.test(inst)) {
        showModal("🚫", "Error de Técnico", "El Código de Instalador debe tener exactamente <b>4 números</b>.", true, false, 'error');
        return;
    }

    currentSettings = { installer: inst, actuation: act };

    // Iniciar Audio Context (requiere interacción usuario)
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    startCamera();
});

stopBtn.addEventListener('click', () => {
    showModal(
        "🔄",
        "Confirmar Cambio",
        "Se va a retroceder para poder cambiar de ACTUACION, no se perderán los datos ya escaneados.",
        true,
        false,
        'info',
        () => stopCamera(true),
        "CANCELAR"
    );
});

resetBtn.addEventListener('click', () => {
    if (readings.length === 0) return;
    if (confirm("🗑️ ¿Borrar TODA la lista?")) {
        readings = [];
        saveAndRender();
    }
});

sendBtn.addEventListener('click', sendDataToGoogle);

// SLIDERS LISTENERS
brightnessSlider.addEventListener('input', updateFilters);
contrastSlider.addEventListener('input', updateFilters);

function updateFilters() {
    const b = brightnessSlider.value;
    const c = contrastSlider.value;
    const video = document.querySelector('#reader video');
    if (video) {
        video.style.filter = `brightness(${b}) contrast(${c})`;
    }
}

// CÁMARA
async function startCamera() {
    setupScreen.classList.add('hidden');
    workspaceScreen.classList.remove('hidden');

    const config = {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        formatsToSupport: [Html5QrcodeSupportedFormats.DATA_MATRIX]
    };

    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            onScan,
            (err) => { }
        );
        setTimeout(setupCameraHardware, 500);

    } catch (e) {
        console.error(e);
        showModal("❌", "Error de Cámara", "No se pudo acceder a la cámara o el formato no es compatible.<br><small>" + e + "</small>", true, false, 'error');
        stopCamera();
    }
}

async function stopCamera(fromBackButton = false) {
    if (html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop();
    }
    workspaceScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    isTorchOn = false;
    torchBtn.disabled = true;
    torchBtn.classList.remove('active');

    if (fromBackButton) {
        installerInput.disabled = true;
        actuationInput.disabled = false;
        actuationInput.focus();
        actuationInput.select();
    }
}

function onScan(decodedText, decodedResult) {
    const now = Date.now();
    if (decodedText === lastScanned && (now - lastTime < 2000)) return;

    // PREVENCIÓN DE DUPLICADOS
    const isDuplicate = readings.some(r => r.code === decodedText);
    if (isDuplicate) {
        playErrorSound();
        showModal("🛑", "Código Duplicado", `El código <b>${decodedText}</b> ya ha sido escaneado previamente.`, true, false, 'error');
        return;
    }

    lastScanned = decodedText;
    lastTime = now;

    // SONIDO BEEP Y VIBRACIÓN
    playBeep();
    if (navigator.vibrate) navigator.vibrate(200);

    const newItem = {
        id: now,
        timestamp: new Date().toLocaleTimeString('es-ES'),
        installer: currentSettings.installer.toUpperCase(),
        actuation: currentSettings.actuation.toUpperCase(),
        code: decodedText
    };

    readings.unshift(newItem);
    saveAndRender();
}

function playBeep() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

function playErrorSound() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth'; // Sonido más agresivo
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

function setupCameraHardware() {
    const video = document.querySelector("#reader video");
    if (video && video.srcObject) {
        updateFilters();

        const track = video.srcObject.getVideoTracks()[0];
        if (track) {
            streamTrack = track;
            capabilities = track.getCapabilities ? track.getCapabilities() : {};

            if (capabilities.torch) {
                torchBtn.disabled = false;
                torchBtn.onclick = toggleTorch;
            }

            if (capabilities.zoom) {
                zoomRow.style.display = 'flex';
                zoomSlider.min = capabilities.zoom.min;
                zoomSlider.max = capabilities.zoom.max;
                zoomSlider.step = capabilities.zoom.step || 0.1;
                zoomSlider.value = capabilities.zoom.min;

                zoomSlider.oninput = (e) => {
                    track.applyConstraints({ advanced: [{ zoom: e.target.value }] });
                };
            }
        }
    }
}

async function toggleTorch() {
    if (!streamTrack) return;
    isTorchOn = !isTorchOn;
    try {
        await streamTrack.applyConstraints({ advanced: [{ torch: isTorchOn }] });
        if (isTorchOn) torchBtn.classList.add('active');
        else torchBtn.classList.remove('active');
    } catch (e) {
        isTorchOn = !isTorchOn;
    }
}

// VISUALIZACIÓN TABLA
function saveAndRender() {
    localStorage.setItem('dm_readings', JSON.stringify(readings));
    renderTable();
}

function renderTable() {
    tableBody.innerHTML = '';

    if (readings.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    emptyState.style.display = 'none';

    readings.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.timestamp}</td>
             <td>${item.installer}</td>
            <td>${item.actuation}</td>
            <td class="code-cell">${item.code}</td>
            <td>
                <button class="delete-btn" onclick="deleteItem(${item.id})">🗑️</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

window.deleteItem = function (id) {
    showModal(
        "🗑️",
        "¿Eliminar fila?",
        "Esta acción no se puede deshacer.",
        true,
        false,
        'info',
        () => {
            readings = readings.filter(r => r.id !== id);
            saveAndRender();
        },
        "CANCELAR"
    );
};

// MODAL ELEMENTS
const modalOverlay = document.getElementById('status-modal');
const modalIcon = document.getElementById('modal-icon');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');

if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeModal);

function showModal(icon, title, msg, showBtn = false, spin = false, type = 'info', onConfirm = null, cancelTxt = null) {
    if (!modalOverlay) return;
    const content = modalOverlay.querySelector('.modal-content');

    // Resetear clases
    content.classList.remove('error', 'success', 'info');
    if (type) content.classList.add(type);

    modalIcon.textContent = icon;
    modalTitle.textContent = title;
    modalMessage.innerHTML = msg;

    if (spin) modalIcon.classList.add('spinning');
    else modalIcon.classList.remove('spinning');

    // Botón Principal
    if (showBtn) modalCloseBtn.classList.remove('hidden');
    else modalCloseBtn.classList.add('hidden');

    // Resetear click handler (importante si hay callback)
    modalCloseBtn.onclick = () => {
        closeModal();
        if (onConfirm) onConfirm();
    };

    // Botón Cancelar
    if (cancelTxt) {
        modalCancelBtn.textContent = cancelTxt;
        modalCancelBtn.classList.remove('hidden');
    } else {
        modalCancelBtn.classList.add('hidden');
    }

    modalOverlay.classList.remove('hidden');
}

function closeModal() {
    modalOverlay.classList.add('hidden');
}

// ENVÍO DATOS (TÉCNICA DE IFRAME OCULTO - SILENCIOSO Y EFECTIVO)
function sendDataToGoogle() {
    if (readings.length === 0) return alert("Nada que enviar");

    // 1. Mostrar Modal Informativo
    showModal("⏳", "Enviando...", "Registrando datos de forma segura...", false, true);

    const dataToSend = readings.map(r => [
        r.installer, r.actuation, r.code, new Date(r.id).toLocaleString('es-ES')
    ]);

    // 2. Crear un Formulario Dinámico Invisible
    const form = document.createElement('form');
    form.method = 'GET';
    form.action = APPS_SCRIPT_URL;
    form.target = 'silent-sender'; // Envia al iframe oculto puesto en el HTML

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'data';
    input.value = JSON.stringify(dataToSend);
    form.appendChild(input);

    document.body.appendChild(form);

    // 3. Enviar
    form.submit();

    // 4. Feedback y limpieza (esperamos un poco para simular carga)
    setTimeout(() => {
        showModal("✅", "¡Enviado!", "Los datos se han registrado correctamente.", true, false);

        // Limpiamos todo y volvemos al inicio
        readings = [];
        saveAndRender();

        installerInput.value = '';
        actuationInput.value = '';
        installerInput.disabled = false;
        actuationInput.disabled = false;

        stopCamera(false); // Volver a pantalla de inicio

        // Re-habilitamos el instalador por si desea cambiar de técnico después de enviar
        installerInput.disabled = false;

        // Borrar el formulario temporal del DOM
        document.body.removeChild(form);
    }, 2500);
}
