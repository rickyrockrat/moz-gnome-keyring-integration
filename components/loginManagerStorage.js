const Cc = Components.classes;
const Ci = Components.interfaces;
const { console } = Components.utils.import("resource://gre/modules/devtools/Console.jsm", {});
//let console = (Cu.import("resource://gre/modules/devtools/Console.jsm", {})).console;
console.log("Start login man ");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Promise.jsm");

var keyring = {};
Components.utils.import("chrome://gnome-keyring/content/gnome-keyring.js", keyring);

function GnomeKeyringLoginManagerStorage() {}
GnomeKeyringLoginManagerStorage.prototype = {
	classDescription: "GNOME Keyring nsILoginManagerStorage implementation",
	contractID: "@sebastianwick.net/login-manager/storage/gnomekeyring;1",
	classID: Components.ID("{36defadb-7c73-4019-a77c-53c42bda0957}"),
	QueryInterface: XPCOMUtils.generateQI([Ci.nsILoginManagerStorage]),

	prefBranch: "extensions.gnome-keyring.",
	attributePasswordField: "passwordField",
	attributeHostname: "hostname",
	attributeFormSubmitURL: "formSubmitURL",
	attributeHttpRealm: "httpRealm",
	attributeLoginInfoMagic: "mozLoginInfoMagic",
	attributeDisabledHostMagic: "mozDisabledHostMagic",
	attributeDisabledHostName: "disabledHost",
	attributeUsername: "username",
	attributeUsernameField: "usernameField",
	attributeInfoMagic: "mozLoginInfoMagic",

	get uiBusy() {
		return false;
	},

	get isLoggedIn() {
		return true;
	},

	// Console logging service, used for debugging.
	__logService : null,
	get _logService() {
		if (!this.__logService)
			this.__logService = Cc["@mozilla.org/consoleservice;1"].
						getService(Ci.nsIConsoleService);
		return this.__logService;
	},
	log: function (message) {
		dump("GnomeKeyringLoginManagerStorage: " + message + "\n");
		this._logService.logStringMessage("GnomeKeyringLoginManagerStorage: " + message);
	},

	// Logs function name and arguments for debugging
	stub: function(arguments) {
		var args = [];
		for (let i = 0; i < arguments.length; i++)
			args.push(arguments[i])
		this.log("Called " + arguments.callee.name + "(" + args.join(",") + ")");
	},

	get keyringName() {
		return this._keyringName;
	},
	set keyringName(name) {
		this._keyringName = name.length == 0 ? null : name;
	},

	init: function() {
		var prefBranch = Cc["@mozilla.org/preferences-service;1"]
					.getService(Ci.nsIPrefService)
					.getBranch(this.prefBranch);
		prefBranch.QueryInterface(Ci.nsIPrefBranch);

		this.keyringName = prefBranch.getCharPref("keyringName");
		var lms = this;
		prefBranch.addObserver("", {
			observe: function(aSubject, aTopic, aData) {
				if(aData == "keyringName")
					lms.keyringName = prefBranch.getCharPref("keyringName");
			}
		}, false);
	},
	initialize: function() {
		this.init();
		return new Promise(function (resolve) { resolve(); });
	},
	initWithFile: function(aInputFile, aOutputFile) {
		this.init();
	},
	terminate: function() {
		return new Promise(function (resolve) { resolve(); });
	},
	addLogin: function(login) {
		this.tryUnlockKeyring();

		var attr = {};
		attr[this.attributeHostname] = login.hostname;
		attr[this.attributeFormSubmitURL] = login.formSubmitURL;
		attr[this.attributeHttpRealm] = login.httpRealm;
		attr[this.attributeUsername] = login.username;
		attr[this.attributeUsernameField] = login.usernameField;
		attr[this.attributePasswordField] = login.passwordField;
		attr[this.attributeInfoMagic] = "loginInfoMagicv1";

		keyring.itemCreate(this.keyringName, keyring.Values.ItemType.GENERIC_SECRET,
				   login.hostname, attr, login.password, true);
	},
	removeLogin: function(login) {
		this.tryUnlockKeyring();

		var items = keyring.getItems(this.keyringName);
		for(var i=0; i<items.length; i++) {
			if (items[i].attributes[this.attributeHostname] == login.hostname &&
			    items[i].attributes[this.attributeFormSubmitURL] == login.formSubmitURL &&
			    items[i].attributes[this.attributeHttpRealm] == login.httpRealm &&
			    items[i].attributes[this.attributeUsername] == login.username &&
			    items[i].attributes[this.attributeUsernameField] == login.usernameField &&
			    items[i].attributes[this.attributePasswordField] == login.passwordField &&
			    items[i].attributes[this.attributeInfoMagic] == "loginInfoMagicv1")
				keyring.itemDelete(this.keyringName, items[i].id);
		}
	},
	modifyLogin: function(oldLogin, newLoginData) {
		this.tryUnlockKeyring();

		var newLogin = null;
		if (newLoginData instanceof Components.interfaces.nsIPropertyBag) {
			newLogin = oldLogin.clone();
			let propEnum = newLoginData.enumerator;
			while (propEnum.hasMoreElements()) {
				let prop = propEnum.getNext().QueryInterface(Ci.nsIProperty);
				switch (prop.name) {
				case "hostname":
				case "httpRealm":
				case "formSubmitURL":
				case "username":
				case "password":
				case "usernameField":
				case "passwordField":
					newLogin[prop.name] = prop.value;
					break;
				default:
					break;
				}
			}
		} else {
			newLogin = newLoginData.clone();
		}
		this.removeLogin(oldLogin);
		this.addLogin(newLogin);
	},
	getAllLogins: function(count) {
		var logins = this.findLogins(count, null, null, null);
		return logins;
	},
	getAllEncryptedLogins: function(count) {
		var logins = this.findLogins(count, null, null, null);
		for(var i in logins)
			logins[i].password = null;
		return logins;
	},
	removeAllLogins: function() {
		this.tryUnlockKeyring();

		var items = keyring.getItems(this.keyringName);
		for(var i=0; i<items.length; i++) {
			if (items[i].attributes[this.attributeInfoMagic] == "loginInfoMagicv1")
				keyring.itemDelete(this.keyringName, items[i].id);
		}
	},
	getAllDisabledHosts: function(count) {
		this.tryUnlockKeyring();

		var items = keyring.getItems(this.keyringName);
		var hosts = [];
		for(var i=0; i<items.length; i++) {
			var item = items[i];
			if(item.attributes[this.attributeDisabledHostMagic] ==
			     "disabledHostMagicv1") {
				hosts.push(item.attributes[this.attributeDisabledHostName]);
			}
		}
		count.value = hosts.length;
		return hosts;
	},
	getLoginSavingEnabled: function(hostname) {
		this.tryUnlockKeyring();

		var items = keyring.getItems(this.keyringName);
		for(var i=0; i<items.length; i++) {
			var item = items[i];
			if(item.attributes[this.attributeDisabledHostMagic] ==
			     "disabledHostMagicv1" &&
			   item.attributes[this.attributeDisabledHostName] ==
			     hostname) {
				return false;
			}
		}
		return true;
	},
	setLoginSavingEnabled: function(hostname, enabled) {
		// getLoginSavingEnabled calls tryUnlockKeyring().
		var isEnabled = this.getLoginSavingEnabled(hostname);
		if(!enabled && isEnabled) {
			var attr = {};
			attr[this.attributeDisabledHostName] = hostname;
			attr[this.attributeDisabledHostMagic] = "disabledHostMagicv1";

			keyring.itemCreate(this.keyringName, keyring.Values.ItemType.NOTE,
					"Mozilla disabled host (" + hostname + ")",
					attr, "", true);
		}
		else if(enabled && !isEnabled) {
			var items = keyring.getItems(this.keyringName);
			for(var i=0; i<items.length; i++) {
				var item = items[i];
				if(item.attributes[this.attributeDisabledHostMagic] ==
				     "disabledHostMagicv1" &&
				   item.attributes[this.attributeDisabledHostName] ==
				     hostname) {
					keyring.itemDelete(this.keyringName, item.id);
				}
			}
		}
	},
	findLogins: function(count, hostname, formSubmitURL, httpRealm) {
		this.tryUnlockKeyring();

		var items = keyring.getItems(this.keyringName);
		var logins = [];
		for(var i=0; i<items.length; i++) {
			var item = items[i];
			if(this.itemMatchesLogin(item, hostname, formSubmitURL, httpRealm)) {
				/**
				 * The HttpRealm must be either a non empty string or null
				 */
				var itemHttpRealm = item.attributes[this.attributeHttpRealm];
				if(itemHttpRealm == "") {
					itemHttpRealm = null;
				}

				var login = Components.classes["@mozilla.org/login-manager/loginInfo;1"]
						.createInstance(Components.interfaces.nsILoginInfo);
				login.init(item.attributes[this.attributeHostname],
					   item.attributes[this.attributeFormSubmitURL],
					   itemHttpRealm,
					   item.attributes[this.attributeUsername],
					   item.secret,
					   item.attributes[this.attributeUsernameField],
					   item.attributes[this.attributePasswordField]);
				logins.push(login);
			}
		}
		count.value = logins.length;
		return logins;
	},
	countLogins: function(aHostname, aFormSubmitURL, aHttpRealm) {
		this.tryUnlockKeyring();

		var items = keyring.getItems(this.keyringName);
		var count = 0;

		for(var i=0; i<items.length; i++) {
			if(this.itemMatchesLogin(items[i], aHostname, aFormSubmitURL, aHttpRealm))
				count++;
		}
		return count;
	},
	searchLogins: function(count, matchData, logins) {
		// TODO: implement
		this.stub(arguments);
	},
	itemMatchesLogin: function(item, aHostname, aFormSubmitURL, aHttpRealm) {
		return  (item.attributes[this.attributeInfoMagic] == "loginInfoMagicv1") &&
			(typeof aHostname != "string" || aHostname == "" || item.attributes[this.attributeHostname] == aHostname) &&
			(typeof aFormSubmitURL != "string" || aFormSubmitURL == "" || item.attributes[this.attributeFormSubmitURL] == aFormSubmitURL) &&
			(typeof aHttpRealm != "string" || aHttpRealm == "" || item.attributes[this.attributeHttpRealm] == aHttpRealm);
	},
	tryUnlockKeyring: function() {
		if (!keyring.isLocked(this.keyringName)) {
			return;
		}

		try {
			keyring.unlock(this.keyringName, null);
		} catch (e) {
			this.log("Exception: " + e + " in " + e.stack);
		}
	}
};

if (XPCOMUtils.generateNSGetFactory)
	var NSGetFactory = XPCOMUtils.generateNSGetFactory([GnomeKeyringLoginManagerStorage]);
else
	var NSGetModule = XPCOMUtils.generateNSGetModule([GnomeKeyringLoginManagerStorage]);
