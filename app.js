/* 
  app.js (Red Nedeni ve UI İyileştirme Modu)
  - Reddet butonuna basınca sebep sorar.
  - Reddedilen taleplerde sebebi gösterir.
  - UI takılmalarını önler (async/await fix).
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
        // Bazen GAS HTML döner, kontrol edelim
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error("API Raw Response:", text);
            return { status: 'error', message: 'Sunucudan geçersiz yanıt geldi. İşlem yapılmış olabilir sayfayı yenileyin.' };
        }
    } catch (e) {
        Swal.fire('Hata', 'Sunucu bağlantı hatası: ' + e, 'error');
        return { status: 'error' };
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const btn = e.target.querySelector('button');

    btn.innerText = 'Giriş Yapılıyor...'; btn.disabled = true;

    const res = await callApi({ action: 'login', user: u, pass: p });

    if (res && res.status === 'success') {
        currentUser = res;
        document.getElementById('user-display').innerText = `${res.user} (${res.role})`;
        renderDashboard(res.role);
        switchView('dashboard');
    } else {
        Swal.fire('Giriş Başarısız', res.message || 'Bilgileri kontrol ediniz.', 'error');
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
                👋 <strong>Hoş Geldiniz!</strong> Projeniz: <b>${currentUser.project}</b>.
            </div>

            <div class="tabs">
                <button class="tab-btn active" onclick="showTab('new-req', this)">Yeni Talep</button>
                <button class="tab-btn" onclick="showTab('my-req', this)">Geçmiş Taleplerim</button>
            </div>

            <div id="tab-new-req">
                <form onsubmit="submitRequest(event)">
                    <div style="display:grid; grid-template-columns: 2fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label>Ad Soyad *</label>
                            <input type="text" id="fullname" placeholder="Adınız Soyadınız" required>
                        </div>
                        <div class="form-group">
                            <label>Sicil No</label>
                            <input type="text" id="sicil" placeholder="(Varsa)">
                        </div>
                    </div>

                    <div class="form-group">
                        <label>İzin Türü</label>
                        <select id="type">
                            <option>Yıllık İzin</option>
                            <option>Hastalık</option>
                            <option>Mazeret</option>
                            <option>Babalık</option>
                            <option>Evlilik</option>
                            <option>Diğer</option>
                        </select>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group"><label>Başlangıç</label><input type="date" id="start" required></div>
                        <div class="form-group"><label>Bitiş</label><input type="date" id="end" required></div>
                    </div>

                    <div class="form-group">
                        <label>Açıklama</label>
                        <textarea id="reason" rows="3" placeholder="Sebep belirtiniz..." required></textarea>
                    </div>

                    <button type="submit" class="btn-primary">Talebi Gönder</button>
                </form>
            </div>

            <div id="tab-my-req" class="hidden">
                <div style="margin-bottom:10px; color:#64748b; font-size:0.9em;">
                    ℹ️ Sadece <b><span id="filter-name-display">-</span></b> adına ait kayıtlar gösterilmektedir.
                </div>
                <table id="rep-table">
                    <thead><tr><th>Tarih</th><th>Durum</th></tr></thead>
                    <tbody><tr><td colspan="2">Yükleniyor...</td></tr></tbody>
                </table>
            </div>
        `;

        // --- LOCAL STORAGE'DAN BİLGİLERİ ÇEK ---
        const savedName = localStorage.getItem('mtd_fullname');
        const savedSicil = localStorage.getItem('mtd_sicil');

        if (savedName) document.getElementById('fullname').value = savedName;
        if (savedSicil) document.getElementById('sicil').value = savedSicil;

    } else {
        // YÖNETİCİ
        let badgeColor = role === 'TL' ? '#fff7ed' : (role === 'SPV' ? '#fdf4ff' : '#f5f3ff');
        let badgeText = role === 'TL' ? '#c2410c' : (role === 'SPV' ? '#86198f' : '#6d28d9');

        container.innerHTML = `
            <div class="panel-info" style="background:${badgeColor}; color:${badgeText}; border-left-color:${badgeText};">
                🛡️ <strong>${role} Paneli:</strong>
            </div>
            
            <h3>Onay Bekleyenler</h3>
            <table id="admin-table">
                <thead><tr><th>Personel / Proje</th><th>Detay</th><th>İşlem</th></tr></thead>
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
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.innerText = 'Gönderiliyor...';

    // Form Verileri
    const fName = document.getElementById('fullname').value.trim();
    const fSicil = document.getElementById('sicil').value.trim();

    // --- LOCAL STORAGE KAYIT ---
    localStorage.setItem('mtd_fullname', fName);
    localStorage.setItem('mtd_sicil', fSicil);

    const data = {
        action: 'createRequest',
        requester: currentUser.user,
        fullName: fName,
        sicil: fSicil,
        project: currentUser.project,
        type: document.getElementById('type').value,
        startDate: document.getElementById('start').value,
        endDate: document.getElementById('end').value,
        reason: document.getElementById('reason').value
    };

    const res = await callApi({ action: 'createRequest' }, 'POST', data);

    if (res.status === 'success') {
        Swal.fire('Başarılı', 'İzin talebi iletildi.', 'success');
        e.target.reset();
        document.getElementById('fullname').value = fName;
        document.getElementById('sicil').value = fSicil;
        showTab('my-req', document.querySelectorAll('.tab-btn')[1]);
    } else {
        Swal.fire('Hata', 'Bir sorun oluştu: ' + res.message, 'error');
    }
    btn.disabled = false; btn.innerText = 'Talebi Gönder';
}

async function loadMyRequests() {
    const tbody = document.querySelector('#rep-table tbody');
    const filterName = document.getElementById('fullname').value.trim() || localStorage.getItem('mtd_fullname') || '';
    document.getElementById('filter-name-display').innerText = filterName || "Hepsini";

    const data = await callApi({ action: 'getRequests', role: 'Temsilci', user: currentUser.user, filterName: filterName });

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="color:#94a3b8; text-align:center;">Henüz talep yok.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(r => `
        <tr>
            <td>${formatDate(r.start)}<br><small>${r.type}</small></td>
            <td>
                ${getStatusBadge(r.status)}
                ${getRejectionReason(r) ? '<br><small style="color:#ef4444; font-weight:bold;">' + getRejectionReason(r) + '</small>' : ''}
            </td>
        </tr>
    `).join('');
}

async function loadAdminRequests() {
    const tbody = document.querySelector('#admin-table tbody');
    const data = await callApi({ action: 'getRequests', role: currentUser.role, user: currentUser.user, project: currentUser.project });

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="color:#94a3b8; text-align:center;">Onay bekleyen talep yok.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(r => `
        <tr>
            <td>
                <strong>${r.fullName || r.requester}</strong><br>
                <small>${r.project}</small> ${r.sicil ? '<small>(' + r.sicil + ')</small>' : ''}
            </td>
            <td>
                ${r.type}<br>
                <small style="font-style:italic; color:#64748b;">"${r.reason}"</small><br>
                <small>${formatDate(r.start)} - ${formatDate(r.end)}</small>
            </td>
            <td>
                <button class="action-btn approve" onclick="processRequest('${r.id}', 'Onaylandı')">✔</button>
                <button class="action-btn reject" onclick="processRequest('${r.id}', 'Reddedildi')">✖</button>
            </td>
        </tr>
    `).join('');
}

async function processRequest(id, decision) {
    let reason = "";

    // Eğer RED ise sebep sor
    if (decision === 'Reddedildi') {
        const { value: text, isDismissed } = await Swal.fire({
            title: 'Reddetme Sebebi',
            input: 'text',
            inputPlaceholder: 'Örn: Yetersiz izin bakiyesi',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Reddet',
            cancelButtonText: 'İptal',
            inputValidator: (value) => {
                if (!value) return 'Red sebebini yazmanız gerekmektedir!';
            }
        });

        if (isDismissed) return; // İptal edildi
        reason = text;
    } else {
        // Onay ise sadece sor
        const { isConfirmed } = await Swal.fire({
            title: 'Onayla?',
            text: 'Onaylamak istediğinize emin misiniz?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#22c55e',
            confirmButtonText: 'Evet',
            cancelButtonText: 'Hayır'
        });
        if (!isConfirmed) return;
    }

    // Yükleniyor...
    Swal.fire({ title: 'İşleniyor...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const res = await callApi({ action: 'updateStatus' }, 'POST', {
        id: id, role: currentUser.role, decision: decision, reason: reason
    });

    if (res.status === 'success') {
        Swal.fire('Tamamlandı', 'İşlem başarılı.', 'success');
        loadAdminRequests();
    } else {
        Swal.fire('Hata', res.message, 'error');
    }
}

function getRejectionReason(r) {
    // Red sebebini anlamak için yönetici sütunlarına (tl, spv, ik) bakar
    if (r.status !== 'red') return null;
    const checks = [r.ik, r.spv, r.tl];
    for (const c of checks) {
        if (c && c.toString().startsWith('Reddedildi:')) {
            return c.replace('Reddedildi:', 'Sebep:');
        }
    }
    return null;
}

function getStatusBadge(code) {
    const map = {
        'tl_bekliyor': { label: 'TL Onayı Bekliyor', class: 'st-tl_bekliyor' },
        'spv_bekliyor': { label: 'SPV Onayı Bekliyor', class: 'st-spv_bekliyor' },
        'ik_bekliyor': { label: 'İK Onayı Bekliyor', class: 'st-ik_bekliyor' },
        'onaylandi': { label: 'Onaylandı', class: 'st-onaylandi' },
        'red': { label: 'Reddedildi', class: 'st-red' }
    };
    const s = map[code] || { label: code, class: '' };
    return `<span class="status ${s.class}">${s.label}</span>`;
}

function formatDate(d) {
    if (!d) return '-';
    // UTC tarihi kısa format
    return d.split('T')[0].split('-').reverse().join('.');
}
