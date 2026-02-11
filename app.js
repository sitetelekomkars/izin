/* 
  app.js (Sayfalama ve Detaylı Tablo Modu)
  - Tüm veriyi çeker, "10 items per page" olarak sayfalar.
  - Gün sayısı hesaplar (X G).
  - Yöneticiler için 'Onayla/Reddet' butonlarını sadece bekleyenlerde gösterir, geçmişi 'Tamamlandı' gösterir.
*/
const API_URL = 'https://script.google.com/macros/s/AKfycbzPP6GYOHiP6gFdwrBpNtBc9KJSqQ-UE6J-9V9Z2XzES2oW-kfM3G4SDjYCrCorVkVfuQ/exec';

let currentUser = null;
let allAdminRequests = []; // Tüm veriyi burada tutacağız (Admin için)
let currentPage = 1;
const itemsPerPage = 10;

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
        return await res.json();
    } catch (e) {
        console.error("API Hatası:", e);
        return { status: 'error', message: 'Sunucu hatası.' };
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

        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
        Toast.fire({ icon: 'success', title: 'Giriş Başarılı' });
    } else {
        Swal.fire('Giriş Başarısız', res.message || 'Hata', 'error');
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
            <div class="panel-info">👋 <strong>Hoş Geldiniz!</strong> Proje: <b>${currentUser.project}</b>.</div>
            <div class="tabs">
                <button class="tab-btn active" onclick="showTab('new-req', this)">Yeni Talep</button>
                <button class="tab-btn" onclick="showTab('my-req', this)">Geçmiş</button>
            </div>
            <div id="tab-new-req">
                <form onsubmit="submitRequest(event)" autocomplete="off">
                     <div style="display:grid; grid-template-columns: 2fr 1fr; gap: 15px;">
                        <div class="form-group"><label>Ad Soyad *</label><input type="text" id="fullname" required></div>
                        <div class="form-group"><label>Sicil No</label><input type="text" id="sicil"></div>
                    </div>
                    <div class="form-group"><label>İzin Türü</label>
                        <select id="type"><option>Yıllık İzin</option><option>Hastalık</option><option>Mazeret</option><option>Babalık</option><option>Diğer</option></select>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group"><label>Başlangıç</label><input type="date" id="start" required></div>
                        <div class="form-group"><label>Bitiş</label><input type="date" id="end" required></div>
                    </div>
                    <div class="form-group"><label>Açıklama</label><textarea id="reason" rows="3" required></textarea></div>
                    <button type="submit" class="btn-primary" id="btn-submit-req">Talebi Gönder</button>
                </form>
            </div>
            <div id="tab-my-req" class="hidden">
                 <div style="margin-bottom:10px; color:#64748b; font-size:0.9em;">ℹ️ Filtre: <b><span id="filter-name-display">-</span></b></div>
                <table id="rep-table"><thead><tr><th>Tarih</th><th>Durum</th></tr></thead><tbody><tr><td>Yükleniyor...</td></tr></tbody></table>
            </div>
        `;
        const f = localStorage.getItem('mtd_fullname');
        if (f) document.getElementById('fullname').value = f;
        const s = localStorage.getItem('mtd_sicil');
        if (s) document.getElementById('sicil').value = s;

    } else {
        // ADMIN PANELI - SAYFALAMA YAPISI
        let color = role === 'TL' ? '#fff7ed' : '#f5f3ff';
        container.innerHTML = `
            <div class="panel-info" style="background:${color};">🛡️ <strong>${role} Paneli</strong></div>
            
            <table id="admin-table">
                <thead>
                    <tr>
                        <th style="width:25%">PERSONEL / PROJE</th>
                        <th style="width:20%">TARİH / GÜN</th>
                        <th style="width:25%">TÜR / AÇIKLAMA</th>
                        <th style="width:30%">DURUM / İŞLEM</th>
                    </tr>
                </thead>
                <tbody><tr><td colspan="4">Yükleniyor...</td></tr></tbody>
            </table>
            
            <div class="pagination-container">
                <button class="page-btn" onclick="changePage(-1)">Önceki</button>
                <span class="page-info" id="page-info">Sayfa 1</span>
                <button class="page-btn" onclick="changePage(1)">Sonraki</button>
            </div>
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
            <td>${formatDate(r.start)}<br><small>${calculateDays(r.start, r.end)} Gün</small></td>
            <td>${getStatusBadge(r.status)}
            ${getRejectionReason(r) ? '<br><small style="color:red; font-weight:bold;">' + getRejectionReason(r) + '</small>' : ''}
            </td>
        </tr>
    `).join('');
}

// ADMIN LOAD & PAGINATION
async function loadAdminRequests() {
    allAdminRequests = await callApi({ action: 'getRequests', role: currentUser.role, user: currentUser.user, project: currentUser.project });

    // Sıralama (Önce bekleyenler, sonra tarih)
    if (allAdminRequests && allAdminRequests.length > 0) {
        allAdminRequests.sort((a, b) => {
            // Bekleyenler en üste
            let aPending = needsAction(a);
            let bPending = needsAction(b);
            if (aPending && !bPending) return -1;
            if (!aPending && bPending) return 1;
            return 0; // ID zaten zamana göre sıralı geliyor backendden
        });
    }

    currentPage = 1;
    renderPage(1);
}

function needsAction(r) {
    if (currentUser.role === 'TL' && r.status === 'tl_bekliyor') return true;
    if (currentUser.role === 'SPV' && r.status === 'spv_bekliyor') return true;
    if (currentUser.role === 'İK' && r.status === 'ik_bekliyor') return true;
    return false;
}

function renderPage(page) {
    const tbody = document.querySelector('#admin-table tbody');
    if (!allAdminRequests || allAdminRequests.length === 0) { tbody.innerHTML = '<tr><td colspan="4">Kayıt Yok</td></tr>'; return; }

    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = allAdminRequests.slice(startIndex, endIndex);

    tbody.innerHTML = pageData.map(r => {
        const days = calculateDays(r.start, r.end);

        // Action Column Logic
        let actionContent = '';
        if (needsAction(r)) {
            // Bekliyor -> Butonlar
            actionContent = `
                <button class="action-btn approve" onclick="window.processRequest('${r.id}', 'Onaylandı')">✔</button>
                <button class="action-btn reject" onclick="window.processRequest('${r.id}', 'Reddedildi')">✖</button>
            `;
        } else {
            // Tamamlanmış veya Reddedilmiş -> Statü Rozeti
            if (r.status === 'red') {
                actionContent = `
                    <span class="status st-red">Reddedildi</span><br>
                    ${getRejectionReason(r) ? '<span style="font-size:0.75rem; color:#dc3545; background:#fff5f5; padding:2px 5px; border-radius:4px; margin-top:5px; display:inline-block;">' + getRejectionReason(r) + '</span>' : ''}
                `;
            } else if (r.status === 'onaylandi') {
                actionContent = `<span class="status st-onaylandi">Tamamlandı</span><br><small style="color:#28a745">✔ Onaylandı</small>`;
            } else {
                actionContent = getStatusBadge(r.status); // Başkasında bekliyor
            }
        }

        return `
        <tr>
            <td>
                <div style="font-weight:800; text-transform:uppercase; color:#212529;">${r.fullName || r.requester}</div>
                <span class="badge-project">${r.project}</span>
            </td>
            <td>
                <div>${formatDate(r.start)} <span class="badge-days">${days} G</span></div>
                <div style="font-size:0.8rem; color:#868e96; margin-top:2px;">${formatDate(r.end)}'e kadar</div>
            </td>
            <td>
                <div style="font-weight:600;">${r.type}</div>
                <div style="font-style:italic; color:#868e96; font-size:0.9rem;">"${r.reason}"</div>
            </td>
            <td>${actionContent}</td>
        </tr>
    `}).join('');

    // Update Pagination Controls
    document.getElementById('page-info').innerText = `Sayfa ${currentPage} / ${Math.ceil(allAdminRequests.length / itemsPerPage)}`;
    document.querySelector('.page-btn:first-child').disabled = currentPage === 1;
    document.querySelector('.page-btn:last-child').disabled = endIndex >= allAdminRequests.length;
}

function changePage(dir) {
    const totalPages = Math.ceil(allAdminRequests.length / itemsPerPage);
    const nextPage = currentPage + dir;
    if (nextPage >= 1 && nextPage <= totalPages) {
        currentPage = nextPage;
        renderPage(currentPage);
    }
}

window.processRequest = async function (id, decision) {
    let reason = "";
    if (decision === 'Reddedildi') {
        const { value: text, isDismissed } = await Swal.fire({ title: 'Red Sebebi', input: 'text', showCancelButton: true, confirmButtonText: 'REDDET', confirmButtonColor: '#ef4444' });
        if (isDismissed) return;
        reason = text;
    } else {
        const { isConfirmed } = await Swal.fire({ title: 'Onayla?', icon: 'question', showCancelButton: true, confirmButtonText: 'Evet' });
        if (!isConfirmed) return;
    }

    Swal.showLoading();
    try {
        const res = await callApi({ action: 'updateStatus' }, 'POST', { id: id, role: currentUser.role, decision: decision, reason: reason });
        if (res.status === 'success') {
            Swal.fire('Tamamlandı', 'İşlem Başarılı', 'success');
            loadAdminRequests(); // Refresh
        } else {
            Swal.fire('Hata', 'Hata: ' + res.message, 'error');
        }
    } catch (e) { alert("Hata: " + e); }
}

function calculateDays(start, end) {
    try {
        const d1 = new Date(start); const d2 = new Date(end);
        const diff = Math.abs(d2 - d1);
        return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
    } catch (e) { return 0; }
}

function getRejectionReason(r) {
    if (r.status !== 'red') return null;
    const checks = [r.ik, r.spv, r.tl];
    for (const c of checks) { if (c && c.toString().startsWith('Reddedildi:')) return c.replace('Reddedildi:', 'Sebep:'); }
    return null;
}

function getStatusBadge(code) {
    const map = { 'tl_bekliyor': 'TL Bekleniyor', 'spv_bekliyor': 'SPV Bekleniyor', 'ik_bekliyor': 'İK Bekleniyor', 'onaylandi': 'Tamamlandı', 'red': 'Reddedildi' };
    let cls = 'st-tl_bekliyor';
    if (code === 'onaylandi') cls = 'st-onaylandi';
    else if (code === 'red') cls = 'st-red';
    else if (code === 'spv_bekliyor') cls = 'st-spv_bekliyor';
    else if (code === 'ik_bekliyor') cls = 'st-ik_bekliyor';
    return `<span class="status ${cls}">${map[code]}</span>`;
}

function formatDate(d) {
    try { return d.split('T')[0].split('-').reverse().join('.'); } catch (e) { return '-'; }
}
