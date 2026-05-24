/* =========================================================
   FinTrack — Income & Expense Tracker
   Vanilla JS + jQuery + Bootstrap 5 + Chart.js + SweetAlert2
   All data persisted in localStorage.
   ========================================================= */

(function ($) {
  "use strict";

  // ---------- Storage Keys ----------
  const K = {
    tx: "ft_transactions",
    cat: "ft_categories",
    settings: "ft_settings",
  };

  // ---------- Defaults ----------
  const DEFAULT_CATEGORIES = [
    { id: uid(), name: "Salary", type: "income" },
    { id: uid(), name: "Freelancing", type: "income" },
    { id: uid(), name: "Bonus", type: "income" },
    { id: uid(), name: "Investments", type: "income" },
    { id: uid(), name: "Food", type: "expense" },
    { id: uid(), name: "Travel", type: "expense" },
    { id: uid(), name: "Shopping", type: "expense" },
    { id: uid(), name: "Rent", type: "expense" },
    { id: uid(), name: "Bills", type: "expense" },
    { id: uid(), name: "Entertainment", type: "expense" },
  ];

  const DEFAULT_SETTINGS = {
    currency: "USD",
    budget: 0,
    dark: false,
  };

  const CURRENCY_SYMBOLS = { USD:"$", EUR:"€", GBP:"£", INR:"₹", JPY:"¥", AUD:"A$" };

  // ---------- State ----------
  let transactions = load(K.tx, []);
  let categories = load(K.cat, DEFAULT_CATEGORIES);
  let settings = Object.assign({}, DEFAULT_SETTINGS, load(K.settings, {}));
  let charts = {};
  let dt = null;

  // ---------- Helpers ----------
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function load(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } }
  function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function fmt(n) {
    const s = CURRENCY_SYMBOLS[settings.currency] || "$";
    return s + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function monthKey(d) { return (d || "").slice(0, 7); }
  function toast(msg, type = "success") {
    Swal.fire({
      toast: true, position: "top-end", icon: type, title: msg,
      showConfirmButton: false, timer: 2200, timerProgressBar: true,
    });
  }
  function showLoader(){$("#loader").addClass("show")}
  function hideLoader(){$("#loader").removeClass("show")}

  // ---------- Navigation ----------
  function go(page) {
    $(".page").addClass("d-none");
    $("#page-" + page).removeClass("d-none");
    $(".sidebar-nav .nav-link").removeClass("active");
    $(`.sidebar-nav .nav-link[data-page="${page}"]`).addClass("active");
    const titles = {
      dashboard: ["Dashboard", "Welcome back, here's your money snapshot."],
      transactions: ["Transactions", "Manage every income and expense entry."],
      categories: ["Categories", "Organize how you classify your money."],
      reports: ["Reports", "Visualize trends and analyze your habits."],
      settings: ["Settings", "Personalize your experience."],
    };
    const t = titles[page] || ["", ""];
    $("#pageTitle").text(t[0]);
    $("#pageSubtitle").text(t[1]);
    $("#sidebar").removeClass("show");
    $("#sidebarBackdrop").removeClass("show");
    if (page === "dashboard") renderDashboard();
    if (page === "transactions") renderTransactions();
    if (page === "categories") renderCategories();
    if (page === "reports") renderReports();
    if (page === "settings") renderSettings();
  }

  // ---------- Categories ----------
  function categoriesByType(type) {
    return categories.filter(c => c.type === type);
  }
  function fillCategorySelect($sel, type) {
    $sel.empty();
    categoriesByType(type).forEach(c => {
      $sel.append(`<option value="${c.id}">${c.name}</option>`);
    });
  }
  function catName(id) {
    const c = categories.find(x => x.id === id);
    return c ? c.name : "—";
  }
  function renderCategories() {
    const $list = $("#catList").empty();
    ["income", "expense"].forEach(type => {
      const items = categoriesByType(type);
      $list.append(`<div class="mb-2"><strong class="text-${type === "income" ? "success" : "danger"}">${type === "income" ? "Income" : "Expense"} Categories</strong></div>`);
      const $wrap = $('<div class="mb-3"></div>');
      if (!items.length) $wrap.append('<div class="text-muted small">None yet.</div>');
      items.forEach(c => {
        $wrap.append(`
          <span class="cat-chip">
            <i class="fa-solid fa-tag" style="color:var(--muted)"></i> ${c.name}
            <span class="actions">
              <button data-edit="${c.id}" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
              <button data-del="${c.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </span>
          </span>`);
      });
      $list.append($wrap);
    });
    // refresh selects
    const activeType = $('input[name="qaType"]:checked').val() || "expense";
    fillCategorySelect($("#qaCategory"), activeType);
    refreshFilterCategory();
  }
  $(document).on("click", "[data-edit]", function () {
    const id = $(this).data("edit");
    const c = categories.find(x => x.id === id);
    if (!c) return;
    $("#catId").val(c.id);
    $("#catName").val(c.name);
    $("#catType").val(c.type);
    $("#catName").focus();
  });
  $(document).on("click", "[data-del]", function () {
    const id = $(this).data("del");
    Swal.fire({
      title: "Delete category?",
      text: "Existing transactions will keep this category by name.",
      icon: "warning", showCancelButton: true, confirmButtonColor: "#ef4444",
    }).then(r => {
      if (!r.isConfirmed) return;
      categories = categories.filter(c => c.id !== id);
      save(K.cat, categories);
      renderCategories();
      toast("Category deleted");
    });
  });
  $("#catForm").on("submit", function (e) {
    e.preventDefault();
    const id = $("#catId").val();
    const name = $("#catName").val().trim();
    const type = $("#catType").val();
    if (!name) return toast("Name is required", "error");
    if (id) {
      const c = categories.find(x => x.id === id);
      if (c) { c.name = name; c.type = type; }
    } else {
      categories.push({ id: uid(), name, type });
    }
    save(K.cat, categories);
    this.reset(); $("#catId").val("");
    renderCategories();
    toast("Saved");
  });
  $("#catReset").on("click", () => $("#catId").val(""));

  // ---------- Transactions ----------
  function addTx(tx) {
    transactions.push(tx);
    save(K.tx, transactions);
  }
  function updateTx(id, patch) {
    const i = transactions.findIndex(t => t.id === id);
    if (i >= 0) { transactions[i] = { ...transactions[i], ...patch }; save(K.tx, transactions); }
  }
  function delTx(id) {
    transactions = transactions.filter(t => t.id !== id);
    save(K.tx, transactions);
  }

  function refreshFilterCategory() {
    const $s = $("#txFilterCategory");
    const cur = $s.val();
    $s.empty().append('<option value="">All</option>');
    categories.forEach(c => $s.append(`<option value="${c.id}">${c.name} (${c.type})</option>`));
    $s.val(cur || "");
  }

  function filteredTx() {
    const q = ($("#txSearch").val() || "").toLowerCase().trim();
    const type = $("#txFilterType").val();
    const cat = $("#txFilterCategory").val();
    const month = $("#txFilterMonth").val();
    return transactions.filter(t => {
      if (type && t.type !== type) return false;
      if (cat && t.categoryId !== cat) return false;
      if (month && monthKey(t.date) !== month) return false;
      if (q) {
        const hay = `${t.notes || ""} ${catName(t.categoryId)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderTransactions() {
    refreshFilterCategory();
    const list = filteredTx().sort((a, b) => b.date.localeCompare(a.date));
    if (dt) { dt.destroy(); $("#txTable tbody").empty(); }
    $("#txEmpty").toggleClass("d-none", list.length > 0);
    if (!list.length) return;
    const rows = list.map(t => [
      t.date,
      `<span class="badge-type ${t.type === "income" ? "badge-income" : "badge-expense"}">${t.type}</span>`,
      catName(t.categoryId),
      `<div class="text-end fw-bold ${t.type === "income" ? "text-success" : "text-danger"}">${t.type === "income" ? "+" : "-"}${fmt(t.amount)}</div>`,
      (t.notes || "—").replace(/</g, "&lt;"),
      `<div class="text-end">
        <button class="btn btn-sm btn-outline-secondary me-1" data-view="${t.id}"><i class="fa-solid fa-eye"></i></button>
        <button class="btn btn-sm btn-outline-primary me-1" data-tx-edit="${t.id}"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-sm btn-outline-danger" data-tx-del="${t.id}"><i class="fa-solid fa-trash"></i></button>
      </div>`,
    ]);
    dt = $("#txTable").DataTable({
      data: rows,
      pageLength: 10,
      lengthMenu: [5, 10, 25, 50],
      order: [[0, "desc"]],
      destroy: true,
      columnDefs: [{ orderable: false, targets: [5] }],
      language: { search: "", searchPlaceholder: "Quick search..." },
    });
  }

  $("#txSearch, #txFilterType, #txFilterCategory, #txFilterMonth").on("input change", renderTransactions);

  $(document).on("click", "[data-tx-del]", function () {
    const id = $(this).data("tx-del");
    Swal.fire({ title: "Delete transaction?", icon: "warning", showCancelButton: true, confirmButtonColor: "#ef4444" })
      .then(r => { if (r.isConfirmed) { delTx(id); renderTransactions(); renderDashboard(); toast("Deleted"); } });
  });
  $(document).on("click", "[data-view]", function () {
    const t = transactions.find(x => x.id === $(this).data("view"));
    if (!t) return;
    $("#viewBody").html(`
      <div class="row g-2">
        <div class="col-6"><div class="text-muted small">Date</div><div class="fw-bold">${t.date}</div></div>
        <div class="col-6"><div class="text-muted small">Type</div><div class="fw-bold text-capitalize">${t.type}</div></div>
        <div class="col-6"><div class="text-muted small">Category</div><div class="fw-bold">${catName(t.categoryId)}</div></div>
        <div class="col-6"><div class="text-muted small">Amount</div><div class="fw-bold ${t.type==='income'?'text-success':'text-danger'}">${fmt(t.amount)}</div></div>
        <div class="col-12"><div class="text-muted small">Notes</div><div>${(t.notes||'—').replace(/</g,'&lt;')}</div></div>
      </div>`);
    new bootstrap.Modal("#viewModal").show();
  });
  $(document).on("click", "[data-tx-edit]", function () {
    const t = transactions.find(x => x.id === $(this).data("tx-edit"));
    if (!t) return;
    $("#txModalTitle").text("Edit Transaction");
    $("#txId").val(t.id);
    $(`input[name="txType"][value="${t.type}"]`).prop("checked", true).trigger("change");
    $("#txAmount").val(t.amount);
    $("#txDate").val(t.date);
    $("#txNotes").val(t.notes || "");
    setTimeout(() => $("#txCategory").val(t.categoryId), 50);
    new bootstrap.Modal("#txModal").show();
  });
  $("#newTxBtn").on("click", function () {
    $("#txModalTitle").text("New Transaction");
    $("#txForm")[0].reset();
    $("#txId").val("");
    $("#txExpense").prop("checked", true).trigger("change");
    $("#txDate").val(today());
  });
  $('input[name="txType"]').on("change", function () {
    fillCategorySelect($("#txCategory"), $(this).val());
  });
  $("#txForm").on("submit", function (e) {
    e.preventDefault();
    const id = $("#txId").val();
    const type = $('input[name="txType"]:checked').val();
    const amount = parseFloat($("#txAmount").val());
    const categoryId = $("#txCategory").val();
    const date = $("#txDate").val();
    const notes = $("#txNotes").val().trim();
    if (!amount || amount <= 0) return Swal.fire("Invalid amount", "Amount must be greater than 0", "error");
    if (!categoryId) return Swal.fire("Missing category", "Please choose a category", "error");
    if (!date) return Swal.fire("Missing date", "Please choose a date", "error");
    const payload = { type, amount, categoryId, date, notes };
    if (id) updateTx(id, payload);
    else addTx({ id: uid(), ...payload });
    bootstrap.Modal.getInstance(document.getElementById("txModal")).hide();
    renderTransactions(); renderDashboard();
    toast(id ? "Updated" : "Added");
  });

  // ---------- Quick Add ----------
  $('input[name="qaType"]').on("change", function () {
    fillCategorySelect($("#qaCategory"), $(this).val());
  });
  $("#quickAddForm").on("submit", function (e) {
    e.preventDefault();
    const f = e.target;
    const type = $('input[name="qaType"]:checked').val();
    const amount = parseFloat(f.amount.value);
    const categoryId = $("#qaCategory").val();
    const date = f.date.value;
    const notes = f.notes.value.trim();
    if (!amount || amount <= 0) return Swal.fire("Invalid amount", "Amount must be greater than 0", "error");
    if (!categoryId) return Swal.fire("Missing category", "Please choose a category", "error");
    if (!date) return Swal.fire("Missing date", "Please choose a date", "error");
    addTx({ id: uid(), type, amount, categoryId, date, notes });
    f.reset();
    $("#qaDate").val(today());
    renderDashboard();
    toast("Transaction added");
  });

  // ---------- Dashboard ----------
  function totals() {
    let inc = 0, exp = 0;
    transactions.forEach(t => t.type === "income" ? inc += +t.amount : exp += +t.amount);
    return { inc, exp, bal: inc - exp };
  }
  function renderDashboard() {
    const { inc, exp, bal } = totals();
    $("#statIncome").text(fmt(inc));
    $("#statExpense").text(fmt(exp));
    $("#statBalance").text(fmt(bal));
    const budget = +settings.budget || 0;
    $("#statBudget").text(fmt(budget));
    const thisMonth = new Date().toISOString().slice(0,7);
    const monthExp = transactions.filter(t => t.type==="expense" && monthKey(t.date)===thisMonth).reduce((a,b)=>a+ +b.amount,0);
    const pct = budget ? Math.min(100, Math.round((monthExp/budget)*100)) : 0;
    $("#budgetBar").css("width", pct + "%");
    $("#budgetText").text(budget ? `${pct}% used` : "No budget set");

    // recent
    const recent = [...transactions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
    const $r = $("#recentList").empty();
    if (!recent.length) {
      $r.html('<div class="empty-state"><i class="fa-regular fa-folder-open"></i><p>No transactions yet</p></div>');
    } else {
      recent.forEach(t => {
        $r.append(`
          <div class="recent-item">
            <div class="recent-icon ${t.type}"><i class="fa-solid fa-${t.type==='income'?'arrow-up':'arrow-down'}"></i></div>
            <div class="recent-meta">
              <div class="t">${catName(t.categoryId)}</div>
              <div class="s">${t.date} · ${(t.notes||'').slice(0,30) || '—'}</div>
            </div>
            <div class="recent-amt ${t.type}">${t.type==='income'?'+':'-'}${fmt(t.amount)}</div>
          </div>`);
      });
    }
    drawCharts();
  }

  function drawCharts() {
    // Pie: expenses by category
    const expByCat = {};
    transactions.filter(t=>t.type==="expense").forEach(t=>{
      const n = catName(t.categoryId);
      expByCat[n] = (expByCat[n]||0)+ +t.amount;
    });
    const pieLabels = Object.keys(expByCat);
    const pieData = Object.values(expByCat);
    const palette = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#0ea5e9","#ef4444","#14b8a6","#f97316","#a855f7"];

    if (charts.pie) charts.pie.destroy();
    charts.pie = new Chart($("#pieChart"), {
      type: "doughnut",
      data: { labels: pieLabels.length?pieLabels:["No data"], datasets: [{ data: pieData.length?pieData:[1], backgroundColor: palette, borderWidth:0 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom" } }, cutout:"65%" }
    });

    // Bar: monthly income vs expense (last 6 months)
    const months = [];
    const now = new Date();
    for (let i=5;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push(d.toISOString().slice(0,7)); }
    const incArr = months.map(m=>transactions.filter(t=>t.type==="income"&&monthKey(t.date)===m).reduce((a,b)=>a+ +b.amount,0));
    const expArr = months.map(m=>transactions.filter(t=>t.type==="expense"&&monthKey(t.date)===m).reduce((a,b)=>a+ +b.amount,0));
    if (charts.bar) charts.bar.destroy();
    charts.bar = new Chart($("#barChart"), {
      type:"bar",
      data:{ labels: months, datasets:[
        { label:"Income", data:incArr, backgroundColor:"#10b981", borderRadius:6 },
        { label:"Expense", data:expArr, backgroundColor:"#ef4444", borderRadius:6 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom" } }, scales:{ y:{ beginAtZero:true } } }
    });
  }

  // ---------- Reports ----------
  function renderReports() {
    const year = new Date().getFullYear();
    const ytd = transactions.filter(t=>t.date.startsWith(year));
    const inc = ytd.filter(t=>t.type==="income").reduce((a,b)=>a+ +b.amount,0);
    const exp = ytd.filter(t=>t.type==="expense").reduce((a,b)=>a+ +b.amount,0);
    const monthsSeen = new Set(ytd.map(t=>monthKey(t.date))).size || 1;
    $("#rpIncome").text(fmt(inc));
    $("#rpExpense").text(fmt(exp));
    $("#rpNet").text(fmt(inc-exp));
    $("#rpAvg").text(fmt(exp/monthsSeen));

    // trend
    const labels = []; const incs=[]; const exps=[];
    for (let m=0;m<12;m++){
      const key = `${year}-${String(m+1).padStart(2,"0")}`;
      labels.push(new Date(year,m,1).toLocaleString(undefined,{month:"short"}));
      incs.push(ytd.filter(t=>t.type==="income"&&t.date.startsWith(key)).reduce((a,b)=>a+ +b.amount,0));
      exps.push(ytd.filter(t=>t.type==="expense"&&t.date.startsWith(key)).reduce((a,b)=>a+ +b.amount,0));
    }
    if (charts.trend) charts.trend.destroy();
    charts.trend = new Chart($("#trendChart"),{
      type:"line",
      data:{ labels, datasets:[
        { label:"Income", data:incs, borderColor:"#10b981", backgroundColor:"rgba(16,185,129,.15)", tension:.35, fill:true },
        { label:"Expense", data:exps, borderColor:"#ef4444", backgroundColor:"rgba(239,68,68,.15)", tension:.35, fill:true },
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:"bottom"}} }
    });

    // category breakdown
    const byCat = {};
    ytd.filter(t=>t.type==="expense").forEach(t=>{
      const n = catName(t.categoryId);
      byCat[n] = (byCat[n]||0)+ +t.amount;
    });
    if (charts.cat) charts.cat.destroy();
    charts.cat = new Chart($("#catChart"),{
      type:"bar",
      data:{ labels:Object.keys(byCat).length?Object.keys(byCat):["No data"], datasets:[{ data:Object.values(byCat).length?Object.values(byCat):[0], backgroundColor:"#6366f1", borderRadius:6 }] },
      options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
    });

    const $tb = $("#yearlyTable").empty();
    for (let m=0;m<12;m++){
      const i=incs[m], e=exps[m];
      $tb.append(`<tr>
        <td>${new Date(year,m,1).toLocaleString(undefined,{month:"long"})}</td>
        <td class="text-end text-success">${fmt(i)}</td>
        <td class="text-end text-danger">${fmt(e)}</td>
        <td class="text-end fw-bold">${fmt(i-e)}</td>
      </tr>`);
    }
  }

  // ---------- Settings ----------
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", settings.dark ? "dark" : "light");
    $("#themeToggle i").attr("class", settings.dark ? "fa-solid fa-sun" : "fa-solid fa-moon");
  }
  function renderSettings() {
    $("#setCurrency").val(settings.currency);
    $("#setBudget").val(settings.budget || "");
    $("#setDark").prop("checked", !!settings.dark);
  }
  $("#saveSettings").on("click", function () {
    settings.currency = $("#setCurrency").val();
    settings.budget = parseFloat($("#setBudget").val()) || 0;
    settings.dark = $("#setDark").is(":checked");
    save(K.settings, settings);
    applyTheme();
    renderDashboard();
    toast("Settings saved");
  });
  $("#themeToggle").on("click", function () {
    settings.dark = !settings.dark;
    save(K.settings, settings);
    applyTheme();
  });
  $("#exportData").on("click", function () {
    const blob = new Blob([JSON.stringify({ transactions, categories, settings }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "fintrack-data.json"; a.click();
  });
  $("#clearData").on("click", function () {
    Swal.fire({ title: "Clear all data?", text: "This cannot be undone.", icon: "warning", showCancelButton: true, confirmButtonColor: "#ef4444" })
      .then(r => {
        if (!r.isConfirmed) return;
        transactions = []; categories = DEFAULT_CATEGORIES; settings = { ...DEFAULT_SETTINGS };
        save(K.tx, transactions); save(K.cat, categories); save(K.settings, settings);
        applyTheme(); renderDashboard(); renderCategories(); renderSettings();
        toast("All data cleared");
      });
  });

  // ---------- Export ----------
  $("#exportExcel").on("click", function (e) {
    e.preventDefault();
    const rows = filteredTx().map(t => ({
      Date: t.date, Type: t.type, Category: catName(t.categoryId), Amount: t.amount, Notes: t.notes || "",
    }));
    if (!rows.length) return toast("No data to export", "info");
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, "transactions.xlsx");
  });
  $("#exportPdf").on("click", function (e) {
    e.preventDefault();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Transactions Report", 14, 18);
    doc.setFontSize(10); doc.text(new Date().toLocaleString(), 14, 24);
    const rows = filteredTx().map(t => [t.date, t.type, catName(t.categoryId), fmt(t.amount), t.notes || ""]);
    doc.autoTable({ startY: 30, head: [["Date", "Type", "Category", "Amount", "Notes"]], body: rows, styles: { fontSize: 9 }, headStyles: { fillColor: [99,102,241] } });
    doc.save("transactions.pdf");
  });
  $("#printReport").on("click", function (e) { e.preventDefault(); window.print(); });

  // ---------- Nav events ----------
  $(document).on("click", "[data-page]", function (e) {
    e.preventDefault();
    go($(this).data("page"));
  });
  $("#menuToggle").on("click", () => { $("#sidebar").toggleClass("show"); $("#sidebarBackdrop").toggleClass("show"); });
  $("#sidebarBackdrop").on("click", () => { $("#sidebar").removeClass("show"); $("#sidebarBackdrop").removeClass("show"); });

  // ---------- Init ----------
  $(function () {
    applyTheme();
    $("#qaDate").val(today());
    fillCategorySelect($("#qaCategory"), "expense");
    fillCategorySelect($("#txCategory"), "expense");
    renderDashboard();
    // small loading flourish
    showLoader(); setTimeout(hideLoader, 300);
  });

})(jQuery);
