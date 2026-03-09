/* Readeck2Zotero v0.2.4 */

var PREF_URL   = "extensions.readeck-import.serverUrl";
var PREF_TOKEN = "extensions.readeck-import.apiToken";
var PLUGIN_ID  = "readeck-import@zotero-plugin";
var TOOLS_ID   = "readeck-import-tools";
var CTX_ID     = "readeck-import-ctx";
var CTX_SEP_ID = "readeck-import-ctx-sep";

// ── Lifecycle ─────────────────────────────────────────────────────────────────

async function startup({ id, version, rootURI }, reason) {
  await Zotero.initializationPromise;

  for (let win of Services.wm.getEnumerator("navigator:browser")) {
    addToWindow(win);
  }
  Services.wm.addListener(winListener);
}

function shutdown({ id, version, rootURI }, reason) {
  Services.wm.removeListener(winListener);
  for (let win of Services.wm.getEnumerator("navigator:browser")) {
    removeFromWindow(win);
  }
}

function install() {}
function uninstall() {}
function onMainWindowLoad({ window }) { addToWindow(window); }
function onMainWindowUnload({ window }) { removeFromWindow(window); }

var winListener = {
  onOpenWindow(xulWin) {
    let win;
    try {
      win = xulWin.QueryInterface(Ci.nsIInterfaceRequestor)
                  .getInterface(Ci.mozIDOMWindowProxy);
    } catch(e) { return; }
    win.addEventListener("load", function onLoad() {
      win.removeEventListener("load", onLoad);
      addToWindow(win);
    });
  },
  onCloseWindow() {},
  onWindowTitleChange() {}
};

// ── UI : Menu Outils + clic-droit ─────────────────────────────────────────────

function addToWindow(win) {
  var doc = win.document;

  // Menu Outils → Importer annotations Readeck
  var toolsPopup = doc.getElementById("menu_ToolsPopup");
  if (toolsPopup && !doc.getElementById(TOOLS_ID)) {
    var sep = doc.createXULElement("menuseparator");
    sep.id = TOOLS_ID + "-sep";
    toolsPopup.appendChild(sep);

    var mi = doc.createXULElement("menuitem");
    mi.id = TOOLS_ID;
    mi.setAttribute("label", "Importer annotations Readeck\u2026");
    mi.addEventListener("command", function() {
      importAnnotations(win).catch(function(e) {
        Services.prompt.alert(win, "Readeck2Zotero", "Erreur : " + e.message);
      });
    });
    toolsPopup.appendChild(mi);

    var miCfg = doc.createXULElement("menuitem");
    miCfg.id = TOOLS_ID + "-cfg";
    miCfg.setAttribute("label", "Configurer Readeck\u2026");
    miCfg.addEventListener("command", function() { openConfigDialog(win); });
    toolsPopup.appendChild(miCfg);
  }

  // Bouton logo dans la toolbar Zotero
  var toolbar = doc.getElementById("zotero-toolbar");
  if (toolbar && !doc.getElementById(TOOLS_ID + "-btn")) {
    var btn = doc.createXULElement("toolbarbutton");
    btn.id = TOOLS_ID + "-btn";
    btn.setAttribute("tooltiptext", "Importer annotations Readeck");
    btn.setAttribute("style",
      "margin:2px 4px;padding:2px;width:24px;height:24px;" +
      "list-style-image:url(\"data:image/svg+xml," + encodeURIComponent(READECK_SVG) + "\");" +
      "-moz-appearance:none;border:none;background:transparent;cursor:pointer;"
    );
    btn.addEventListener("command", function() {
      importAnnotations(win).catch(function(e) {
        Services.prompt.alert(win, "Readeck2Zotero", "Erreur : " + e.message);
      });
    });
    toolbar.appendChild(btn);
  }

  // Clic-droit sur item (gardé pour commodité)
  var itemmenu = doc.getElementById("zotero-itemmenu");
  if (itemmenu && !doc.getElementById(CTX_ID)) {
    var sep2 = doc.createXULElement("menuseparator");
    sep2.id = CTX_SEP_ID;
    itemmenu.appendChild(sep2);

    var mi2 = doc.createXULElement("menuitem");
    mi2.id = CTX_ID;
    mi2.setAttribute("label", "Importer annotations Readeck\u2026");
    mi2.addEventListener("command", function() {
      importAnnotations(win).catch(function(e) {
        Services.prompt.alert(win, "Readeck2Zotero", "Erreur : " + e.message);
      });
    });
    itemmenu.appendChild(mi2);
  }
}

function removeFromWindow(win) {
  var doc = win.document;
  [TOOLS_ID, TOOLS_ID + "-sep", TOOLS_ID + "-cfg", TOOLS_ID + "-btn", CTX_ID, CTX_SEP_ID].forEach(function(id) {
    var el = doc.getElementById(id);
    if (el) el.remove();
  });
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

function xhrGetJson(url, token) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("If-None-Match", "");
    xhr.setRequestHeader("If-Modified-Since", "Thu, 01 Jan 1970 00:00:00 GMT");
    xhr.setRequestHeader("Cache-Control", "no-cache");
    xhr.setRequestHeader("Pragma", "no-cache");
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch(e) { reject(new Error("JSON invalide : " + xhr.responseText.slice(0, 120))); }
      } else {
        reject(new Error("HTTP " + xhr.status + " — " + xhr.responseText.slice(0, 120)));
      }
    };
    xhr.onerror = function() { reject(new Error("Erreur réseau")); };
    xhr.send();
  });
}

// ── Logique principale ────────────────────────────────────────────────────────

async function importAnnotations(win) {
  var serverUrl = Zotero.Prefs.get(PREF_URL, true) || "";
  var apiToken  = Zotero.Prefs.get(PREF_TOKEN, true) || "";

  if (!serverUrl || !apiToken) {
    var configured = openConfigDialog(win);
    if (!configured) return;
    serverUrl = Zotero.Prefs.get(PREF_URL, true) || "";
    apiToken  = Zotero.Prefs.get(PREF_TOKEN, true) || "";
    if (!serverUrl || !apiToken) return;
  }

  serverUrl = serverUrl.replace(/\/$/, "");

  var zoteroItem = Zotero.getActiveZoteroPane().getSelectedItems()[0];
  if (!zoteroItem || !zoteroItem.isRegularItem()) {
    zalert(win, "Sélectionne un item Zotero avant d'importer.");
    return;
  }

  // ── Étape 1 : ID depuis Extra, sinon chercher par titre ───────────────────
  var bookmarkId = getReadeckIdFromExtra(zoteroItem);

  if (!bookmarkId) {
    var title = zoteroItem.getField("title") || "";
    if (title) {
      try {
        var searchData = await xhrGetJson(
          serverUrl + "/api/bookmarks?title=" + encodeURIComponent(title) + "&_=" + Date.now(),
          apiToken
        );
        var hits = Array.isArray(searchData) ? searchData : (searchData.items || searchData.bookmarks || []);
        if (hits.length > 0) bookmarkId = hits[0].id;
      } catch(e) {
        Zotero.logError(e);
      }
    }

    if (!bookmarkId) {
      var hint = title ? "Aucun bookmark trouvé pour :\n" + title + "\n\n" : "";
      var input = zprompt(win, hint + "Colle l'URL ou l'ID du bookmark Readeck :", "");
      if (!input) return;
      bookmarkId = extractId(input);
      if (!bookmarkId) { zalert(win, "Format non reconnu."); return; }
    }

    setReadeckIdInExtra(zoteroItem, bookmarkId);
    await zoteroItem.saveTx();
  }

  // ── Étape 2 : récupérer les annotations ───────────────────────────────────
  var annotations;
  try {
    var raw = await xhrGetJson(
      serverUrl + "/api/bookmarks/" + bookmarkId + "/annotations?_=" + Date.now(),
      apiToken
    );
    annotations = Array.isArray(raw) ? raw : (raw.results || raw.annotations || raw.items || []);
  } catch(e) {
    zalert(win, "Erreur lors de la récupération des annotations :\n" + e.message);
    return;
  }

  if (!annotations.length) {
    zalert(win, "Aucune annotation trouvée pour ce bookmark (" + bookmarkId + ").");
    return;
  }

  annotations.sort(function(a, b) {
    var ra = selectorRank(a.start_selector) * 1000000 + (a.start_offset || 0);
    var rb = selectorRank(b.start_selector) * 1000000 + (b.start_offset || 0);
    return ra - rb;
  });

  var itemTitle = zoteroItem.getField("title") || "Sans titre";
  var readeckUrl = serverUrl + "/bookmarks/" + bookmarkId;

  var note = new Zotero.Item("note");
  note.libraryID = zoteroItem.libraryID;
  note.parentID  = zoteroItem.id;
  note.setNote(buildNote(annotations, itemTitle, readeckUrl));
  await note.saveTx();

  zalert(win, annotations.length + " annotation(s) importée(s) depuis Readeck.");
}

// ── Note (format B — prise de notes académique) ───────────────────────────────

function buildNote(annotations, itemTitle, readeckUrl) {
  var today = new Date().toLocaleDateString("fr-FR");
  var parts = [];

  parts.push('<h2>' + esc(itemTitle) + '</h2>');
  parts.push(
    '<p style="color:#666;font-size:0.9em;">' +
    '<a href="' + readeckUrl + '">Lire sur Readeck</a>' +
    ' &nbsp;&middot;&nbsp; Import\u00e9 le ' + today +
    '</p>'
  );
  parts.push('<hr/>');

  for (var i = 0; i < annotations.length; i++) {
    var ann  = annotations[i];
    var para = extractPara(ann.start_selector) || String(i + 1);
    var color = ann.color || "yellow";
    var dotColor    = colorToDot(color);
    var borderColor = colorToBorder(color);

    // Référence §chemin¶N ■ «incipit»
    var inc = incipit(ann.text, 40);
    parts.push(
      '<p style="margin:0 0 5px;">' +
      '<strong>[&sect;' + para + ']</strong>' +
      ' <span style="color:' + dotColor + ';font-size:1em;" title="' + color + '">\u25a0</span>' +
      (inc ? ' <em style="color:#888;font-weight:normal;">&laquo;' + esc(inc) + '&raquo;</em>' : '') +
      '</p>'
    );

    // Citation
    if (ann.text) {
      parts.push(
        '<blockquote style="' +
        'margin:0 0 5px 0;padding:6px 12px;' +
        'border-left:4px solid ' + borderColor + ';' +
        'background:#fafafa;font-style:normal;' +
        '">' + esc(ann.text) + '</blockquote>'
      );
    }

    // Note manuscrite
    if (ann.note) {
      parts.push(
        '<p style="margin:0 0 2px 4px;color:#444;font-style:italic;">' +
        '\u2192 ' + esc(ann.note) + '</p>'
      );
    }

    if (i < annotations.length - 1) {
      parts.push('<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;"/>');
    }
  }

  return parts.join('\n');
}

// ── SVG logo Readeck (inline pour le bouton toolbar) ─────────────────────────

var READECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="m398.6 144.7-217 101.2v155.5l276.6-129z" fill="#fbce55"/><path d="M181.6 249.2v155.5L411.8 512 398 427.8l73.3-43.5z" fill="#46bbd6"/><path d="M40.6 77.7h140.9v417.5H40.6z" fill="#096f86"/><path d="M40.6 77.7v9l407.9 190.2 9.7-4.5z" fill-opacity=".31"/><path d="m181.6 0-141 77.7 417.5 194.7V116.9z" fill="#46bbd6"/></svg>';

// ── Dialogue de configuration ─────────────────────────────────────────────────

function openConfigDialog(win) {
  var currentUrl   = Zotero.Prefs.get(PREF_URL, true) || "";
  var currentToken = Zotero.Prefs.get(PREF_TOKEN, true) || "";

  var urlRes = { value: currentUrl };
  var ok = Services.prompt.prompt(win, "Readeck Import — Configuration",
    "URL du serveur Readeck :", urlRes, null, {});
  if (!ok) return false;
  var newUrl = urlRes.value.trim().replace(/\/$/, "");
  if (!newUrl) return false;

  var tokenRes = { value: currentToken };
  var ok2 = Services.prompt.prompt(win, "Readeck Import — Configuration",
    "Token API :", tokenRes, null, {});
  if (!ok2) return false;
  var newToken = tokenRes.value.trim();
  if (!newToken) return false;

  Zotero.Prefs.set(PREF_URL,   newUrl,   true);
  Zotero.Prefs.set(PREF_TOKEN, newToken, true);
  Services.prompt.alert(win, "Readeck2Zotero", "Configuration sauvegardée ✓");
  return true;
}

// ── Extra field ───────────────────────────────────────────────────────────────

function getReadeckIdFromExtra(item) {
  var extra = item.getField("extra") || "";
  var m = extra.match(/^readeck:\s*([a-zA-Z0-9_-]+)/m);
  return m ? m[1] : null;
}

function setReadeckIdInExtra(item, bookmarkId) {
  var extra = item.getField("extra") || "";
  if (/^readeck:/m.test(extra)) {
    extra = extra.replace(/^readeck:\s*[a-zA-Z0-9_-]*/m, "readeck: " + bookmarkId);
  } else {
    extra = "readeck: " + bookmarkId + (extra ? "\n" + extra : "");
  }
  item.setField("extra", extra);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function selectorRank(selector) {
  if (!selector) return 0;
  var rank = 0, re = /\[(\d+)\]/g, m;
  while ((m = re.exec(selector)) !== null) rank = rank * 1000 + parseInt(m[1], 10);
  return rank;
}

function extractPara(selector) {
  if (!selector) return "";
  // Chemin condensé : indices des sections + paragraphe ex: 3.2¶2
  var sections = [];
  var re = /section\[(\d+)\]/g, m;
  while ((m = re.exec(selector)) !== null) sections.push(m[1]);
  var para = selector.match(/p\[(\d+)\][^/]*$/);
  var ref = sections.length ? sections.join(".") : "";
  if (para) ref += (ref ? "\u00b6" : "") + para[1];
  return ref || "";
}

function incipit(text, maxChars) {
  if (!text) return "";
  var t = text.trim();
  if (t.length <= maxChars) return t;
  // Coupe au dernier espace avant maxChars
  var cut = t.lastIndexOf(" ", maxChars);
  return t.slice(0, cut > 0 ? cut : maxChars) + "\u2026";
}

function colorToDot(color) {
  return { yellow: "#F9A825", red: "#E53935", blue: "#1E88E5", green: "#43A047" }[color] || "#999";
}

function colorToBorder(color) {
  return { yellow: "#FDD835", red: "#EF9A9A", blue: "#90CAF9", green: "#A5D6A7" }[color] || "#ddd";
}

function extractId(input) {
  input = input.trim();
  var m = input.match(/\/bookmarks\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]+$/.test(input)) return input;
  return null;
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function zprompt(win, msg, def) {
  var r = { value: def || "" };
  return Services.prompt.prompt(win, "Readeck2Zotero", msg, r, null, {}) ? r.value.trim() : null;
}

function zalert(win, msg) {
  Services.prompt.alert(win, "Readeck2Zotero", msg);
}
