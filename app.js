(function () {
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  var PLANES = {
    base: { id: "base", name: "Base — Recepción", alta: 690, mes: 179, min: 300, wa: 400,
      bullets: ["Contesta llamadas y WhatsApp","Email al negocio","Pasa a humano","Genera prompt y plantillas"] },
    pro: { id: "pro", name: "Pro — Agenda", alta: 1190, mes: 299, min: 400, wa: 600,
      bullets: ["Todo Base","Ofrece huecos y confirma cita","Evento de calendario","WhatsApp de confirmación"] },
    plus: { id: "plus", name: "Plus — Activo", alta: 1990, mes: 449, min: 600, wa: 1000,
      bullets: ["Todo Pro","Recordatorio 24 h por WhatsApp","Llamada si no responde","Cola de salientes"] }
  };
  var SECTORS = {
    restauracion: { horario: "L-D 12:00-16:00 y 19:30-23:30", tono: "Cercano, rápido, tutea.",
      kb: "Margarita 9,50 EUR\nDiavola 12 EUR\nCuatro quesos 12,50 EUR\nCalzone 13,50 EUR\nCoca-Cola 2 EUR\nReparto zona 1 1,50 EUR",
      limites: "No improvisa precios. No cobra tarjeta: anota efectivo o tarjeta al llegar.",
      handoff: "Pedido > 80 EUR, queja o alergeno no listado.", servicios: "Pedido domicilio o recoger." },
    salud: { horario: "L-V 09:00-20:00", tono: "Formal, de usted. No diagnostica.",
      kb: "Revision desde 40 EUR (30 min)\nLimpieza desde 55 EUR (40 min)\nEmpaste desde 70 EUR (45 min)\nUrgencia 60 EUR",
      limites: "No guarda historial clinico.", handoff: "Dolor intenso, sangrado o menor sin tutor.",
      servicios: "Revision 30 min\nHigiene 40 min\nEmpaste 45 min" },
    servicios: { horario: "L-V 09:00-18:00", tono: "Profesional y breve.", kb: "Indica servicios y precios.",
      limites: "No cierra descuentos no listados.", handoff: "Reclamacion.", servicios: "Consulta 30 min" },
    generico: { horario: "L-V 09:00-18:00", tono: "Claro y breve.", kb: "Pega aqui lo que el agente debe saber. Texto de ejemplo para validar el minimo de caracteres.",
      limites: "No inventa datos.", handoff: "Queja o humano.", servicios: "Segun negocio" }
  };
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE_RE = /^\+?[0-9\s().-]{9,20}$/;
  var TAX_RE = /^[A-Za-z0-9.-]{8,16}$/;
  var CARD_RE = /^[0-9]{13,19}$/;
  var EXP_RE = /^(0[1-9]|1[0-2])\/(\d{2})$/;
  var db = {
    get: function () { try { return JSON.parse(localStorage.getItem("hablaia_db") || '{"users":[],"orders":[]}'); } catch (e) { return { users: [], orders: [] }; } },
    set: function (d) { localStorage.setItem("hablaia_db", JSON.stringify(d)); },
    session: function () { try { return JSON.parse(localStorage.getItem("hablaia_sess") || "null"); } catch (e) { return null; } },
    setSession: function (u) { localStorage.setItem("hablaia_sess", JSON.stringify(u)); }
  };
  function $(id) { return document.getElementById(id); }
  function go(name) {
    document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("on"); });
    var el = $(name); if (el) el.classList.add("on"); window.scrollTo(0, 0); refreshNav();
  }
  function setInvalid(el, msg) {
    if (!el) return false; el.classList.add("invalid");
    var hint = el.nextElementSibling && el.nextElementSibling.classList.contains("field-err") ? el.nextElementSibling : null;
    if (!hint) { hint = document.createElement("div"); hint.className = "field-err"; el.insertAdjacentElement("afterend", hint); }
    hint.textContent = msg || ""; return false;
  }
  function setValid(el) {
    if (!el) return true; el.classList.remove("invalid");
    if (el.nextElementSibling && el.nextElementSibling.classList.contains("field-err")) el.nextElementSibling.textContent = "";
    return true;
  }
  function requireText(el, min, label) { var v = (el && el.value || "").trim(); if (v.length < min) return setInvalid(el, label + " (min. " + min + ")."); return setValid(el); }
  function requireEmail(el, label) { var v = (el && el.value || "").trim(); if (!EMAIL_RE.test(v)) return setInvalid(el, label + " no valido."); return setValid(el); }
  function optionalPhone(el, label) { var v = (el && el.value || "").trim(); if (!v) return setValid(el); if (!PHONE_RE.test(v)) return setInvalid(el, label + ": +34 y 9+ digitos."); return setValid(el); }
  function requirePhone(el, label) { var v = (el && el.value || "").trim(); if (!PHONE_RE.test(v)) return setInvalid(el, label + ": +34 y 9+ digitos."); return setValid(el); }
  function planCard(p, pick) {
    return '<div class="card"><div class="badge">' + p.id.toUpperCase() + '</div><h3>' + p.name + '</h3>' +
      '<div class="price">' + p.alta + ' EUR <small>+ ' + p.mes + ' EUR/mes</small></div><ul>' +
      p.bullets.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' +
      (pick ? '<button type="button" class="btn primary" style="margin-top:14px" data-plan="' + p.id + '">Contratar</button>' : '') + '</div>';
  }
  function refreshNav() { var s = db.session(); if ($("goAuth")) $("goAuth").textContent = s ? "Salir" : "Entrar"; }
  function currentUserOrders() { var s = db.session(); if (!s) return []; return db.get().orders.filter(function (o) { return o.userId === s.id; }); }
  function generateKit(order) {
    var b = order.brief || {}, p = PLANES[order.plan] || PLANES.base, negocio = b.negocio || "el negocio";
    var prompt = ["Eres el asistente de voz y WhatsApp de " + negocio + ".", "Idioma: " + (b.idioma || "Espanol") + ". Tono: " + (b.tono || "claro") + ".", "Horario: " + (b.horario || "comercial") + ".", "Al inicio di que habla un asistente automatico.", "Usa SOLO esta informacion:", b.kb || "(sin datos)", "Limites: " + (b.limites || "No inventes datos."), "Pasa a humano si: " + (b.handoff || "lo pide."), p.id === "base" ? "No ofrezcas huecos de calendario." : "Si piden cita, ofrece 2 huecos y confirma.", b.sector === "restauracion" ? "Flujo pedido: recoger o reparto, productos, nombre, telefono, direccion, pago. Si efectivo, pregunta billete y anota cambio + datafono." : "", b.sector === "salud" ? "No diagnostiques. Precios son desde." : ""].filter(Boolean).join("\n");
    var emailOps = "Asunto: [" + negocio + "] {{tipo}} {{id}}\nPara: " + (b.emailOps || "ops@negocio.com") + "\nNombre: {{nombre}}\nTelefono: {{tel}}\nResumen: {{resumen}}";
    return { prompt: prompt, emailOps: emailOps, waConfirmacion: "Hola {{nombre}}, confirmamos {{detalle}} en " + negocio + ".",
      waRecordatorio: b.tpl || ("Manana a las {{hora}} le esperamos en " + negocio + ". Responda SI o avise."),
      eventoCalendario: "Titulo: {{servicio}} — {{nombre}}\nInicio: {{fecha}} {{hora}}\nDuracion: " + (b.duracion || "30 min"),
      guionSalida: "Hola, soy el asistente de " + negocio + ". Confirmo su cita de manana a las {{hora}}. ¿Puede venir?",
      colaSalientes: "T-24h WhatsApp. Si no responde en 4 h y horario " + (b.outHours || "09:00-21:00") + ": llamada 20-30 s.",
      checklist: "1. Pegar prompt en Retell/Vapi y WhatsApp.\n2. Email a " + (b.emailOps || "(falta)") + ".\n3. Desviar " + (b.tel || "(falta telefono)") + ".\n4. Meta Cloud API y calendario si Pro/Plus.\nNO automatizado: cobro real, linea y OAuth Google." };
  }
  function kitText(order) {
    var k = order.kit || generateKit(order), p = PLANES[order.plan];
    var parts = ["KIT " + order.id + " · " + p.name, "Cliente: " + order.userName + " <" + order.email + ">", "", "=== PROMPT ===", k.prompt, "", "=== EMAIL ===", k.emailOps];
    if (p.id !== "base") parts.push("", "=== CALENDARIO ===", k.eventoCalendario, "", "=== WA CONFIRMACION ===", k.waConfirmacion);
    if (p.id === "plus") parts.push("", "=== RECORDATORIO ===", k.waRecordatorio, "", "=== LLAMADA ===", k.guionSalida, "", "=== COLA ===", k.colaSalientes);
    parts.push("", "=== CHECKLIST ===", k.checklist);
    return parts.join("\n");
  }
  function saveOrder(order) {
    var data = db.get(); var i = data.orders.findIndex(function (o) { return o.id === order.id; });
    if (i >= 0) data.orders[i] = order; else data.orders.push(order); db.set(data);
  }
  function renderBriefForm() {
    var plan = sessionStorage.getItem("plan") || "base";
    var extraPro = plan !== "base", extraPlus = plan === "plus";
    $("briefForm").innerHTML = '<h3>Negocio</h3><div class="row"><div><label>Nombre comercial *</label><input name="negocio" /></div><div><label>Sector</label><select name="sector"><option value="generico">Generico</option><option value="restauracion">Pizzeria</option><option value="salud">Clinica</option><option value="servicios">Servicios</option></select></div></div><div class="row"><div><label>Telefono *</label><input name="tel" placeholder="+34 600000000" /></div><div><label>WhatsApp</label><input name="wa" /></div></div><div class="row"><div><label>Email ops *</label><input name="emailOps" type="email" /></div><div><label>Idioma</label><select name="idioma"><option>Espanol</option><option>Catalan</option><option>Ingles</option></select></div></div><label>Horario *</label><input name="horario" /><label>Tono</label><input name="tono" /><label>Carta / tarifas *</label><textarea name="kb"></textarea><label>Limites</label><textarea name="limites"></textarea><label>Handoff</label><input name="handoff" />' +
      (extraPro ? '<h3 style="margin-top:16px">Agenda</h3><div class="row"><div><label>Calendario</label><select name="cal"><option>Google Calendar</option><option>Outlook</option></select></div><div><label>Duracion *</label><input name="duracion" placeholder="30 min" /></div></div><label>Servicios *</label><textarea name="servicios"></textarea><label>Email calendario *</label><input name="calEmail" type="email" />' : '') +
      (extraPlus ? '<h3 style="margin-top:16px">Salientes</h3><label>Horario salientes *</label><input name="outHours" placeholder="09:00-21:00" /><label>Plantilla *</label><textarea name="tpl"></textarea>' : '') +
      '<p class="err" id="briefErr"></p><button type="submit" class="btn primary" style="margin-top:14px">Generar paquete</button>';
    var form = $("briefForm");
    form.sector.addEventListener("change", function () {
      var s = SECTORS[form.sector.value] || SECTORS.generico;
      form.horario.value = s.horario; form.tono.value = s.tono; form.kb.value = s.kb; form.limites.value = s.limites; form.handoff.value = s.handoff;
      if (form.servicios) form.servicios.value = s.servicios;
      if (form.tpl) form.tpl.value = "Manana a las {hora} le esperamos. Responda SI o avise.";
      if (form.outHours) form.outHours.value = "09:00-21:00";
      if (form.duracion && !form.duracion.value) form.duracion.value = "30 min";
    });
    form.onsubmit = function (ev) {
      ev.preventDefault();
      var err = $("briefErr"); err.textContent = "";
      var checks = [requireText(form.negocio, 2, "Nombre"), requirePhone(form.tel, "Telefono"), optionalPhone(form.wa, "WhatsApp"), requireEmail(form.emailOps, "Email"), requireText(form.horario, 4, "Horario"), requireText(form.kb, 20, "Carta")];
      if (form.calEmail) checks.push(requireEmail(form.calEmail, "Email calendario"));
      if (form.duracion) checks.push(requireText(form.duracion, 2, "Duracion"));
      if (form.servicios) checks.push(requireText(form.servicios, 8, "Servicios"));
      if (form.outHours) checks.push(requireText(form.outHours, 4, "Horario salientes"));
      if (form.tpl) checks.push(requireText(form.tpl, 10, "Plantilla"));
      if (checks.indexOf(false) !== -1) { err.textContent = "Revisa los campos."; return; }
      var s = db.session(); if (!s) { go("auth"); return; }
      var brief = {}; Array.prototype.forEach.call(form.elements, function (el) { if (el.name) brief[el.name] = el.value; });
      var order = { id: "HX-" + Math.random().toString(36).slice(2, 8).toUpperCase(), userId: s.id, userName: s.name, email: s.email, plan: sessionStorage.getItem("plan") || "base", status: "kit_generado", paid: true, created: Date.now(), log: [{ t: Date.now(), m: "Kit generado." }], brief: brief };
      order.kit = generateKit(order); saveOrder(order); renderDash(); go("dashboard");
    };
  }
  function renderDash() {
    var s = db.session();
    if (!s) { $("dashBody").innerHTML = '<div class="card"><p>Entra con tu cuenta.</p></div>'; return; }
    var orders = currentUserOrders();
    if (!orders.length) { $("dashBody").innerHTML = '<div class="card"><p>Aun no hay paquete.</p><button type="button" class="btn primary" id="dashHire">Contratar</button></div>'; $("dashHire").onclick = function () { go("elegir"); }; return; }
    $("dashBody").innerHTML = orders.map(function (o) {
      var p = PLANES[o.plan];
      return '<div class="card" style="margin-top:14px"><div class="badge">' + o.id + '</div><h3>' + p.name + '</h3><p><span class="tag">' + o.status + '</span></p><div class="brief">' + kitText(o).replace(/</g, "&lt;") + '</div><button type="button" class="btn" style="margin-top:12px" data-copy="' + o.id + '">Copiar kit</button></div>';
    }).join("");
    $("dashBody").onclick = function (e) {
      var id = e.target.getAttribute("data-copy"); if (!id) return;
      var o = db.get().orders.find(function (x) { return x.id === id; });
      if (o && navigator.clipboard) navigator.clipboard.writeText(kitText(o));
      e.target.textContent = "Copiado";
    };
  }
  function renderAdmin() {
    var orders = db.get().orders.slice().reverse();
    $("adminBody").innerHTML = '<p style="margin:12px 0">' + orders.length + ' expedientes</p><div class="card" style="overflow:auto"><table><tr><th>ID</th><th>Cliente</th><th>Plan</th><th>Estado</th><th></th></tr>' +
      (orders.map(function (o) { return '<tr><td>' + o.id + '</td><td>' + o.userName + '</td><td>' + o.plan + '</td><td>' + o.status + '</td><td><button type="button" class="btn" data-view="' + o.id + '">Kit</button> <button type="button" class="btn" data-next="' + o.id + '">Avanzar</button></td></tr>'; }).join("") || '<tr><td colspan="5">Vacio</td></tr>') +
      '</table></div><pre class="brief" id="adminBrief" style="margin-top:16px">Selecciona un expediente.</pre>';
    $("adminBody").onclick = function (e) {
      var view = e.target.getAttribute("data-view"), next = e.target.getAttribute("data-next");
      if (view) { var o = db.get().orders.find(function (x) { return x.id === view; }); $("adminBrief").textContent = o ? kitText(o) : ""; }
      if (next) {
        var data = db.get(); var o2 = data.orders.find(function (x) { return x.id === next; }); if (!o2) return;
        var seq = ["kit_generado", "en_despliegue", "pruebas", "en_produccion"];
        o2.status = seq[Math.min(seq.indexOf(o2.status) + 1, seq.length - 1)]; db.set(data); renderAdmin();
      }
    };
  }
  $("planCards").innerHTML = Object.keys(PLANES).map(function (k) { return planCard(PLANES[k], false); }).join("");
  $("planPick").innerHTML = Object.keys(PLANES).map(function (k) { return planCard(PLANES[k], true); }).join("");
  $("planPick").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-plan]"); if (!btn) return;
    if (!db.session()) { go("auth"); return; }
    sessionStorage.setItem("plan", btn.getAttribute("data-plan"));
    var p = PLANES[btn.getAttribute("data-plan")];
    $("pagoResumen").textContent = p.name + ": alta " + p.alta + " EUR + " + p.mes + " EUR/mes. Pago simulado.";
    go("pago");
  });
  $("goLanding").onclick = function () { go("landing"); };
  $("goPlanes").onclick = function () { go("planes"); };
  $("goStart").onclick = function () { go(db.session() ? "elegir" : "auth"); };
  $("goDash").onclick = function () { renderDash(); go("dashboard"); };
  $("goAdmin").onclick = function () { go("admin"); };
  $("goAuth").onclick = function () {
    if (db.session()) { localStorage.removeItem("hablaia_sess"); refreshNav(); go("landing"); } else go("auth");
  };
  $("btnRegister").onclick = function () {
    $("authErr").textContent = "";
    if (!requireText($("authName"), 2, "Nombre") || !requireEmail($("authEmail"), "Email") || !requireText($("authPass"), 6, "Contrasena")) { $("authErr").textContent = "Revisa los campos."; return; }
    var name = $("authName").value.trim(), email = $("authEmail").value.trim().toLowerCase(), pass = $("authPass").value;
    var data = db.get();
    if (data.users.some(function (u) { return u.email === email; })) { $("authErr").textContent = "Ese email ya existe."; return; }
    var user = { id: uid(), name: name, email: email, pass: pass, created: Date.now() };
    data.users.push(user); db.set(data); db.setSession({ id: user.id, name: name, email: email }); go("elegir");
  };
  $("btnLogin").onclick = function () {
    $("authErr").textContent = "";
    if (!requireEmail($("authEmail"), "Email") || !requireText($("authPass"), 1, "Contrasena")) { $("authErr").textContent = "Email y contrasena."; return; }
    var email = $("authEmail").value.trim().toLowerCase(), pass = $("authPass").value;
    var user = db.get().users.find(function (u) { return u.email === email && u.pass === pass; });
    if (!user) { $("authErr").textContent = "Datos incorrectos."; return; }
    db.setSession({ id: user.id, name: user.name, email: user.email }); renderDash(); go(currentUserOrders().length ? "dashboard" : "elegir");
  };
  $("btnDemoPay").onclick = function () {
    $("ccName").value = $("ccName").value || (db.session() && db.session().name) || "Demo Cliente";
    $("ccNum").value = "4242424242424242"; $("ccExp").value = "12/28"; $("ccCvc").value = "123"; $("ccTax").value = $("ccTax").value || "B12345678";
    ["ccName", "ccNum", "ccExp", "ccCvc", "ccTax"].forEach(function (id) { setValid($(id)); }); $("pagoErr").textContent = "";
  };
  $("btnPagar").onclick = function () {
    $("pagoErr").textContent = "";
    var nameOk = requireText($("ccName"), 3, "Titular");
    var raw = $("ccNum").value.replace(/\s/g, "");
    var numOk = CARD_RE.test(raw) ? setValid($("ccNum")) : setInvalid($("ccNum"), "13-19 digitos.");
    var expOk = EXP_RE.test($("ccExp").value.trim()) ? setValid($("ccExp")) : setInvalid($("ccExp"), "MM/AA");
    var cvcOk = /^[0-9]{3,4}$/.test($("ccCvc").value.trim()) ? setValid($("ccCvc")) : setInvalid($("ccCvc"), "CVC");
    var taxOk = TAX_RE.test($("ccTax").value.trim()) ? setValid($("ccTax")) : setInvalid($("ccTax"), "CIF/NIF");
    if (!nameOk || !numOk || !expOk || !cvcOk || !taxOk) { $("pagoErr").textContent = "Revisa los campos."; return; }
    renderBriefForm(); go("briefing");
  };
  $("btnAdminPin").onclick = function () {
    if ($("adminPin").value !== "2468") { setInvalid($("adminPin"), "PIN 2468"); return; }
    setValid($("adminPin")); $("adminGate").classList.add("hidden"); $("adminBody").classList.remove("hidden"); renderAdmin();
  };
  refreshNav();
})();
