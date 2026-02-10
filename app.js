/* 
  app.js (Fixed Click Handler & Global Scope)
*/
const API_URL = 'https://script.google.com/macros/s/AKfycbzPP6GYOHiP6gFdwrBpNtBc9KJSqQ-UE6J-9V9Z2XzES2oW-kfM3G4SDjYCrCorVkVfuQ/exec';

let currentUser = null;

function switchView(viewName) {
    const loginView = document.getElementById('view-login');
    const dashboardView = document.getElementById('view-dashboard');
    const userInfo = document.getElementById('user-info-panel');

    if (viewName === 'login') {
        loginView.classList.remove('hidden');
        dashboardView.classList.add('hidden');
        userInfo.classList.add('hidden');
        document.body.style.background = "#f1f5f9";
    } else {
        loginView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
        userInfo.classList.remove('hidden');
    }
}

// Basitleştirilmiş API Çağrısı
async function callApi(params, method = 'GET', body = null) {
    const url = new URL(API_URL);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

    const options = {
        method: method,
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const res = await fetch(url, options);
        // Doğrudan JSON parse dene
        const data = await res.json();
        return data;
    } catch (e) {
        console.error("API Hatası:", e);
        // Hata durumunda (eğer HTML dönerse veya ağ hatası)
        return { status: 'error', message: 'Sunucuyla iletişim hatası. Lütfen tekrar deneyin.' };
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.innerText = 'Kontrol ediliyor...'; btn.disabled = true;

    const res = await callApi({ action: 'login', user: document.getElementById('username').value, pass: document.getElementById('password').value });

    if (res && res.status === 'success') {
        currentUser = res;
        document.getElementById('user-display').innerText = `${res.user} (${res.role})`;
        renderDashboard(res.role);
        switchView('dashboard');
    } else {
        Swal.fire('Hata', res.message || 'Giriş başarısız.', 'error');
    }
    btn.innerText = 'Giriş Yap'; btn.disabled = false;
}

function logout() {
    currentUser = null;
    switchView('login');
}

function renderDashboard(role) {
    const container = document.getElementById('dashboard-content');

    if (role === 'Temsilci') {
        container.innerHTML = `
            <div class="panel-info">
                👋 <strong>Hoş Geldiniz!</strong> Proje: <b>${currentUser.project}</b>.
            </div>
            <div class="tabs">
                <button class="tab-btn active" onclick="showTab('new-req', this)">Yeni Talep</button>
                <button class="tab-btn" onclick="showTab('my-req', this)">Geçmiş</button>
            </div>
            <div id="tab-new-req">
                <form onsubmit="submitRequest(event)" autocomplete="off">
                    <div style="display:grid; grid-template-columns: 2fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label>Ad Soyad *</label>
                            <input type="text" id="fullname" placeholder="Ad Soyad" required>
                        </div>
                        <div class="form-group">
                            <label>Sicil No</label>
                            <input type="text" id="sicil" placeholder="Sicil">
                        </div>
                    </div>
                    <div class="form-group"><label>İzin Türü</label>
                        <select id="type"><option>Yıllık İzin</option><option>Hastalık</option><option>Mazeret</option><option>Babalık</option><option>Diğer</option></select>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group"><label>Başlangıç</label><input type="date" id="start" required></div>
                        <div class="form-group"><label>Bitiş</label><input type="date" id="end" required></div>
                    </div>
                    <div class="form-group"><label>Açıklama</label><textarea id="reason" rows="3" placeholder="Açıklama..." required></textarea></div>
                    <button type="submit" class="btn-primary" id="btn-submit-req">Talebi Gönder</button>
                </form>
            </div>
            <div id="tab-my-req" class="hidden">
                 <div style="margin-bottom:10px; color:#64748b; font-size:0.9em;">
                    ℹ️ Filtre: <b><span id="filter-name-display">-</span></b>
                </div>
                <table id="rep-table"><thead><tr><th>Tarih</th><th>Durum</th></tr></thead><tbody><tr><td>Yükleniyor...</td></tr></tbody></table>
            </div>
        `;
        // Restore LocalStorage
        const f = localStorage.getItem('mtd_fullname');
        if (f) document.getElementById('fullname').value = f;
        const s = localStorage.getItem('mtd_sicil');
        if (s) document.getElementById('sicil').value = s;

    } else {
        // ADMIN PANELI (Basitleştirilmiş Görüntü)
        let color = role === 'TL' ? '#fff7ed' : '#f5f3ff';
        container.innerHTML = `
            <div class="panel-info" style="background:${color};">
                🛡️ <strong>${role} Paneli:</strong> Onay Bekleyenler
            </div>
            <table id="admin-table">
                <thead><tr><th>Personel</th><th>Detay</th><th>İşlem</th></tr></thead>
                <tbody><tr><td colspan="3">Yükleniyor...</td></tr></tbody>
            </table>
        `;
        loadAdminRequests();
    }
}

function showTab(tabId, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-new-req').classList.add('hidden');
    document.getElementById('tab-my-req').classList.add('hidden');
    document.getElementById('tab-' + tabId).classList.remove('hidden');
    if (tabId === 'my-req') loadMyRequests();
}

async function submitRequest(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-req');
    const startVal = document.getElementById('start').value;
    const endVal = document.getElementById('end').value;

    if (new Date(endVal) < new Date(startVal)) { Swal.fire('Hata', 'Tarihleri kontrol ediniz.', 'warning'); return; }

    btn.disabled = true; btn.innerText = 'Gönderiliyor...';

    const fName = document.getElementById('fullname').value.trim();
    const fSicil = document.getElementById('sicil').value.trim();
    localStorage.setItem('mtd_fullname', fName);
    localStorage.setItem('mtd_sicil', fSicil);

    try {
        const data = {
            action: 'createRequest', requester: currentUser.user,
            fullName: fName, sicil: fSicil, project: currentUser.project, type: document.getElementById('type').value,
            startDate: startVal, endDate: endVal, reason: document.getElementById('reason').value
        };
        const res = await callApi({ action: 'createRequest' }, 'POST', data);
        if (res.status === 'success') {
            Swal.fire('Başarılı', 'İletildi.', 'success');
            e.target.reset();
            document.getElementById('fullname').value = fName;
            document.getElementById('sicil').value = fSicil;
            showTab('my-req', document.querySelectorAll('.tab-btn')[1]);
        } else {
            Swal.fire('Hata', res.message, 'error');
        }
    } finally {
        btn.disabled = false; btn.innerText = 'Talebi Gönder';
    }
}

async function loadMyRequests() {
    const tbody = document.querySelector('#rep-table tbody');
    const filterName = document.getElementById('fullname').value.trim() || localStorage.getItem('mtd_fullname') || '';
    document.getElementById('filter-name-display').innerText = filterName || "Hepsini";

    const data = await callApi({ action: 'getRequests', role: 'Temsilci', user: currentUser.user, filterName: filterName });
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="2">Kayıt yok.</td></tr>'; return; }

    tbody.innerHTML = data.map(r => `
        <tr>
            <td>${formatDate(r.start)}<br><small>${r.type}</small></td>
            <td>${getStatusBadge(r.status)}
            ${getRejectionReason(r) ? '<br><small style="color:red; font-weight:bold;">' + getRejectionReason(r) + '</small>' : ''}
            </td>
        </tr>
    `).join('');
}

async function loadAdminRequests() {
    const tbody = document.querySelector('#admin-table tbody');
    const data = await callApi({ action: 'getRequests', role: currentUser.role, user: currentUser.user, project: currentUser.project });
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="3">Onay bekleyen yok.</td></tr>'; return; }

    tbody.innerHTML = data.map(r => `
        <tr>
            <td>
                <strong>${r.fullName || r.requester}</strong><br>
                <small>${r.project}</small>
            </td>
            <td>
                ${r.type}<br>
                <small style="font-style:italic;">"${r.reason}"</small><br>
                <small>${formatDate(r.start)} - ${formatDate(r.end)}</small>
            </td>
            <td>
                <button class="action-btn approve" onclick="window.processRequest('${r.id}', 'Onaylandı')">✔</button>
                <button class="action-btn reject" onclick="window.processRequest('${r.id}', 'Reddedildi')">✖</button>
            </td>
        </tr>
    `).join('');
    // "Sicil" bilgisini kaldırdım, şifre sanılmasın diye
}

// GLOBAL'e EKLEME - Çok Önemli
window.processRequest = async function (id, decision) {
    let reason = "";
    if (decision === 'Reddedildi') {
        const { value: text, isDismissed } = await Swal.fire({
            title: 'Red Sebebi Giriniz',
            input: 'text',
            showCancelButton: true,
            confirmButtonText: 'REDDET',
            confirmButtonColor: '#ef4444',
            cancelButtonText: 'İptal',
            inputValidator: (val) => { if (!val) return 'Sebep yazmalısınız!'; }
        });
        if (isDismissed) return;
        reason = text;
    } else {
        const { isConfirmed } = await Swal.fire({ title: 'Onaylıyor musunuz?', icon: 'question', showCancelButton: true, confirmButtonText: 'Evet', cancelButtonText: 'Hayır' });
        if (!isConfirmed) return;
    }

    Swal.showLoading();
    try {
        const res = await callApi({ action: 'updateStatus' }, 'POST', { id: id, role: currentUser.role, decision: decision, reason: reason });
        if (res.status === 'success') {
            Swal.fire('Başarılı', 'İşlem yapıldı.', 'success');
            loadAdminRequests();
        } else {
            Swal.fire('Hata', 'Sunucu hatası: ' + res.message, 'error');
        }
    } catch (e) {
        alert("Sistemsel Hata: " + e);
    }
}

function getRejectionReason(r) {
    if (r.status !== 'red') return null;
    const checks = [r.ik, r.spv, r.tl];
    for (const c of checks) { if (c && c.toString().startsWith('Reddedildi:')) return c.replace('Reddedildi:', 'Sebep:'); }
    return null;
}

function getStatusBadge(code) {
    const map = { 'tl_bekliyor': 'TL Onayı Bekliyor', 'spv_bekliyor': 'SPV Onayı Bekliyor', 'ik_bekliyor': 'İK Onayı Bekliyor', 'onaylandi': 'Onaylandı', 'red': 'Reddedildi' };
    const label = map[code] || code;
    let cls = '';
    if (code === 'onaylandi') cls = 'st-onaylandi';
    else if (code === 'red') cls = 'st-red';
    else cls = 'st-tl_bekliyor'; // Default turnuncu
    return `<span class="status ${cls}">${label}</span>`;
}

function formatDate(d) {
    if (!d) return '-';
    try { return d.split('T')[0].split('-').reverse().join('.'); } catch (e) { return d; }
}
