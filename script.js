Number.prototype.padStart = function (size) {
	var s = String(this);
	while (s.length < size) { s = "0" + s; }
	return s;
}

Number.prototype.formatDuration = function () {
	value = Math.max(Math.trunc(this / 1000), 0);
	return (Math.floor(value / 60 / 60) % 60).padStart(2) + ":" + (Math.floor(value / 60) % 60).padStart(2) + ":" + (value % 60).padStart(2);
}

function IndexOfElement(element) {
	return Array.from(element.parentElement.children).indexOf(element)
}

var fontsize = 2;
var fontsize_step = 0.05;

var uuid = uuidv4();
const module_name = "OBS-Key-Moments";

var obs_websocket_connection_state = { disconnected: "disconnected", connecting: "connecting", connected: "connected" };
var obs_websocket_connection = obs_websocket_connection_state.disconnected;

var streaming = false;
var recording = false;
const time_modes = { streaming: "streaming", clock: "clock", recording: "recording" };
var time_mode = time_modes.clock;
var start_time = {};
start_time[time_modes.streaming] = null;
start_time[time_modes.recording] = null;
var order_of_service = [];
var key_moments = [];
var auto_scenes = {};
var scene_names = [];

const obs = new OBSWebSocket();
var obs_websocket_host = uuid;
var host_time_offset = 0;
var obs_websocket_url = "";
var obs_websocket_password = "";

var dragging = null;

errors = {
	AuthenticationRequired: 4009
}

function Start(mode) {
	if (mode != null && (mode === time_modes.streaming || mode === time_modes.recording)) {
		start_time[mode] = new Date().getTime();
		if (obs_websocket_host === uuid) {
			obs.call("BroadcastCustomEvent", { eventData: { module: module_name, method: "UPDATE", start_time: start_time } }).then((res) => {
				if (key_moments.length === 0) {
					AddKeyMoment();
				}
			});
		}

		if (time_mode != mode && key_moments.length === 0) {
			SetTimeMode(mode);
		}
	}
}

function Stop() {
	EnableAddKeyMoment();
	EnableUndoKeyMoment();
	EnableResetKeyMoments();
}

function Connect() {
	if (obs_websocket_connection === obs_websocket_connection_state.disconnected) {
		obs_websocket_connection = obs_websocket_connection_state.connecting;
		obs.connect(obs_websocket_url.length > 0 ? obs_websocket_url : undefined, obs_websocket_password.length > 0 ? obs_websocket_password : undefined).then((res) => {
			obs.call("BroadcastCustomEvent", { eventData: { module: module_name, method: "RequestHost", uuid: uuid } });

			obs.call("GetStreamStatus").then((data) => {
				streaming = data.outputActive;
				obs.call("GetRecordStatus").then((data) => {
					recording = data.outputActive;
					EnableAddKeyMoment();
					EnableUndoKeyMoment();
				});
			});

			PopulateAutoScenes();
			EnableResetKeyMoments();

			obs.call("GetCurrentProgramScene").then(data => {
				EnableSetCurrentScene(data.currentProgramSceneName);
			});
		}, (error) => {
			console.error("Failed to Connect", error.code, error.message);
			if (error.code === errors.AuthenticationRequired) {
				EditAutoScenes(true);
			}
			alert("Failed to Connect\nError Code:" + error.code + "\n" + error.message);
		});
	}
}

function Disconnect() {
	obs.disconnect();
}

$(window).on("load", function () {
	$(".change-font-size[direction]").on("click", (e) => {
		var increase = e.currentTarget.getAttribute("direction") === "+";
		console.log(fontsize);
		fontsize = Math.max(fontsize_step, fontsize + (fontsize_step * (increase ? 1 : -1)));
		window.localStorage.setItem("font-size", fontsize);
		$("body").css("font-size", fontsize + "em");
	})

	$("#order-of-service").on('keydown', ".service-item", (e) => {
		switch (e.key) {
			case 'Enter':
				if (e.currentTarget.innerText.length > 0) {
					var index = IndexOfElement(e.currentTarget.parentElement);
					if (e.currentTarget.innerText.length > 1 && document.getSelection().getRangeAt(0).endOffset > 1) {
						order_of_service.splice(index + 1, 0, "");
						var $el = CreateServiceItem("");
						$(e.currentTarget.parentElement).after($el);
						$el.find(".service-item").focus();
					} else {
						order_of_service.splice(index, 0, "");
						var $el = CreateServiceItem("");
						$(e.currentTarget.parentElement).before($el);
						$el.find(".service-item").focus();
					}
				} else {
					e.currentTarget.blur();
				}
				e.preventDefault();
				break;
			case 'Backspace':
				if (e.currentTarget.innerText.length === 0) {
					e.preventDefault();
					var $el = $(e.currentTarget.parentElement.previousSibling).find(".service-item");
					$el.focus();

					// Set carot to end of text
					var range = document.createRange();
					range.setStart($el[0].childNodes[0], $el.text().length);
					range.collapse(true);
					var sel = window.getSelection();
					sel.removeAllRanges();
					sel.addRange(range);
				}
				break;
			default:
		}
	}).on("mousedown", ".service-item", function (e) {
		// Don't reorder if clicking on the input
		e.stopPropagation();
	}).on("focus", ".service-item", function (e) {
		e.currentTarget.removeAttribute("auto-scene");
	}).on("blur", ".service-item", function (e) {
		var index = IndexOfElement(e.currentTarget.parentElement);
		var value = e.currentTarget.innerText;
		order_of_service[index] = value;
		window.localStorage.setItem("order-of-service", JSON.stringify(order_of_service.filter(e => e)));

		if (value.length === 0 && order_of_service.length > 1) {
			// Remove empty service item
			e.currentTarget.parentElement.remove();
			order_of_service.splice(index, 1);
		} else {
			e.currentTarget.setAttribute("auto-scene", value.length > 0 && typeof auto_scenes[value.split(" - ")[0]] === 'string' ? auto_scenes[value.split(" - ")[0]] : "");
		}

		if (index < key_moments.length) {
			for (var i = 0; i < key_moments.length; i++) {
				key_moments[i].name = order_of_service[i];
			}
			window.localStorage.setItem("key-moments", JSON.stringify(key_moments));
			UpdateKeyMoments();
		}

		EnableAddKeyMoment();

		obs.call("BroadcastCustomEvent", {
			eventData: {
				module: module_name, sender: uuid, method: "UPDATE", order_of_service: order_of_service, key_moments: key_moments
			}
		}, (error) => { console.error(error); });
	}).on("mousedown", "[reorder]", (e) => {
		dragging = IndexOfElement(e.currentTarget);
		$("#order-of-service").attr("dragging", true);
	}).on("mousemove", "[reorder]", (e) => {
		e.preventDefault();
		var index = IndexOfElement(e.currentTarget);
		if (dragging != null && dragging != index && (index >= dragging - 1 && index <= dragging + 1)) {
			order_of_service.splice(dragging < index ? index + 1 : index, 0, order_of_service[dragging]);
			order_of_service.splice(dragging > index ? dragging + 1 : dragging, 1);

			window.localStorage.setItem("order-of-service", JSON.stringify(order_of_service.filter(e => e)));
			UpdateOrderOfService();

			if (index < key_moments.length || dragging < key_moments.length) {
				for (var i = 0; i < key_moments.length; i++) {
					key_moments[i].name = order_of_service[i];
				}
				window.localStorage.setItem("key-moments", JSON.stringify(key_moments));
				UpdateKeyMoments();
				obs.call("GetCurrentProgramScene").then(data => {
					EnableSetCurrentScene(data.currentProgramSceneName);
				});
			}

			obs.call("BroadcastCustomEvent", {
				eventData: {
					module: module_name, sender: uuid, method: "UPDATE", order_of_service: order_of_service, key_moments: key_moments
				}
			}, (error) => { console.error(error); });

			dragging = index;
		}
	}).on("mouseup", "[reorder]", (e) => {
		dragging = null;
		$("#order-of-service").removeAttr("dragging");
	}).on("mouseleave", (e) => {
		dragging = null;
		$("#order-of-service").removeAttr("dragging");
	});

	$("tabgroup[tab-group=timing]").on("click", "tab[value]:not([disabled]):not([selected])", function (e) {
		SetTimeMode(e.currentTarget.getAttribute("value"));
	});

	$("#obs-websocket-url").on("blur", function (e) {
		obs_websocket_url = e.currentTarget.value;
		window.localStorage.setItem("obs-websocket-url", obs_websocket_url);
	});

	$("#obs-websocket-password").on("blur", function (e) {
		obs_websocket_password = e.currentTarget.value;
		window.localStorage.setItem("obs-websocket-password", obs_websocket_password);
	});

	$("#obs-websocket-connect").on("click", function (e) {
		if (obs_websocket_connection !== obs_websocket_connection_state.disconnected) {
			Disconnect();
		} else {
			Connect();
		}
	});

	$(".obs-websocket-connection").on("click", function (e) {
		if (obs_websocket_connection === obs_websocket_connection_state.disconnected) {
			Connect();
		}
	});

	var value = window.localStorage.getItem("font-size");
	if (typeof value === 'string' && value.length > 0) {
		fontsize = parseFloat(value);
	} else {
		fontsize = 2;
	}
	$("body").css("font-size", fontsize + "em");

	value = window.localStorage.getItem("auto-scenes");
	if (typeof value === 'string' && value.length > 0) {
		auto_scenes = JSON.parse(value);
		for (var service_item in auto_scenes) {
			AddAutoScene(service_item);
		}
	}

	value = window.localStorage.getItem("start-time-streaming");
	if (typeof value === 'string' && value.length > 0) {
		start_time[time_modes.streaming] = parseInt(value);
	} else {
		start_time[time_modes.streaming] = null;
	}

	value = window.localStorage.getItem("start-time-recording");
	if (typeof value === 'string' && value.length > 0) {
		start_time[time_modes.recording] = parseInt(value);
	} else {
		start_time[time_modes.recording] = null;
	}

	value = window.localStorage.getItem("time-mode");
	if (typeof value === 'string' && value.length > 0) {
		time_mode = value;
	} else {
		time_mode = time_modes.clock;
	}

	value = window.localStorage.getItem("key-moments");
	if (typeof value === 'string' && value.length > 0) {
		key_moments = JSON.parse(value);
		UpdateKeyMoments();
	}

	$("#tab_streaming").attr("disabled", start_time[time_modes.streaming] == null || key_moments.length == 0 ? "disabled" : null);
	$("#tab_recording").attr("disabled", start_time[time_modes.recording] == null || key_moments.length == 0 ? "disabled" : null);
	$("#tab_clock").attr("disabled", (start_time[time_modes.recording] == null && start_time[time_modes.streaming] == null) || key_moments.length == 0 ? "disabled" : null);

	$("#tab_" + time_mode).attr("selected", "selected");

	value = window.localStorage.getItem("order-of-service");
	if (typeof value === 'string' && value.length > 0) {
		order_of_service = JSON.parse(value);
	} else {
		order_of_service = [];
	}
	UpdateOrderOfService();

	if (key_moments.length > 0) {
		$("#order-of-service li:nth-child(" + key_moments.length + ")").attr("selected", "selected");
	}

	value = window.localStorage.getItem("obs-websocket-url");
	if (typeof value === 'string' && value.length > 0) {
		obs_websocket_url = value;
		$("#obs-websocket-url").val(value);
	}

	value = window.localStorage.getItem("obs-websocket-password");
	if (typeof value === 'string' && value.length > 0) {
		obs_websocket_password = value;
		$("#obs-websocket-password").val(value);
	}

	$("html").attr("obs-websocket-host", obs_websocket_host === uuid);

	Connect();

	obs.on('StreamStateChanged', data => {
		streaming = data.outputActive;
		if (streaming) {
			Start(time_modes.streaming);
		} else {
			Stop();
		}
	});
	obs.on('RecordStateChanged', data => {
		recording = data.outputActive;
		if (recording) {
			Start(time_modes.recording);
		} else {
			Stop();
		}
	});
	obs.on("CurrentProgramSceneChanged", data => {
		EnableSetCurrentScene(data.sceneName);
	});
	obs.on("SceneListChanged", (data) => {
		PopulateAutoScenes();
	});
	obs.on("ConnectionOpened", () => {
		obs_websocket_connection = obs_websocket_connection_state.connected;
		$("html").attr("obs-websocket-state", "connected");
		console.log("OBS WebSocket Connected");
	});
	obs.on("ConnectionClosed", (error) => {
		obs_websocket_connection = obs_websocket_connection_state.disconnected;
		$("html").attr("obs-websocket-state", "disconnected");
		if (typeof error === 'object' && typeof error.message === 'string' && error.message.length > 0) {
			console.error(error);
			alert("OBS Websocket Disconnected\n" + error.message);
		}
	});
	obs.on("CustomEvent", (data) => {
		if (data.module === module_name) {
			if (data.method === "HostInfo") {
				if (obs_websocket_host === uuid && uuid !== data.sender) {
					host_time_offset = new Date().getTime() - data.time;
					if (!data.tried.includes(uuid) && confirm("Are you the new host?")) {
						data.tried.push(uuid);
						obs.call("BroadcastCustomEvent", {
							eventData: {
								module: module_name,
								method: "HostInfo",
								sender: uuid,
								time: new Date().getTime(),
								tried: data.tried
							}
						}).then((res) => {
							obs.call("BroadcastCustomEvent", {
								eventData: {
									module: module_name,
									method: "UPDATE",
									sender: uuid,
									auto_scenes: auto_scenes, order_of_service: order_of_service, key_moments: key_moments, start_time: start_time
								}
							});
						});
						obs_websocket_host = uuid;
					} else {
						obs_websocket_host = data.sender;
						obs.call("BroadcastCustomEvent", {
							eventData: { module: module_name, method: "RequestUpdate" }
						});
					}
				}
				$("html").attr("obs-websocket-host", obs_websocket_host === uuid);
			}
			else if (data.method === "RequestHost" && obs_websocket_host === uuid && data.uuid !== uuid) {
				obs.call("BroadcastCustomEvent", {
					eventData: {
						module: module_name,
						method: "HostInfo",
						sender: uuid,
						time: new Date().getTime(),
						tried: [uuid]
					}
				});
			} else {
				switch (data.method) {
					case "RequestUpdate":
						if (obs_websocket_host === uuid) {
							obs.call("BroadcastCustomEvent", {
								eventData: {
									module: module_name,
									method: "UPDATE",
									sender: uuid,
									auto_scenes: auto_scenes, order_of_service: order_of_service, key_moments: key_moments, start_time: start_time
								}
							});
						}
						break;
					case "UPDATE":
						if (typeof data.sender === 'undefined' || (typeof data.sender === 'string' && data.sender !== uuid)) {
							if (typeof data.auto_scenes === 'object') {
								auto_scenes = data.auto_scenes;
								window.localStorage.setItem("auto-scenes", JSON.stringify(auto_scenes));
								$("#auto-scenes").empty();
								for (var service_item in auto_scenes) {
									AddAutoScene(service_item);
								}
								PopulateAutoScenes();
							}

							if (typeof data.order_of_service === 'object') {
								order_of_service = data.order_of_service;
								window.localStorage.setItem("order-of-service", JSON.stringify(order_of_service.filter(e => e)));

								UpdateOrderOfService();
							}

							if (typeof data.order_of_service === 'object' || typeof data.auto_scenes === 'object') {
								for (var el of $("#order-of-service .service-item")) {
									var value = el.innerText;
									el.setAttribute("auto-scene", value.length > 0 && typeof auto_scenes[value.split(" - ")[0]] === 'string' ? auto_scenes[value.split(" - ")[0]] : "");
								}
							}

							if (typeof data.start_time === 'object') {
								start_time = data.start_time;

								if (typeof start_time[time_modes.recording] === 'number') {
									window.localStorage.setItem("start-time-recording", start_time[time_modes.recording]);
								} else {
									window.localStorage.removeItem("start-time-recording");
								}

								if (typeof start_time[time_modes.streaming] === 'number') {
									window.localStorage.setItem("start-time-streaming", start_time[time_modes.streaming]);
								} else {
									window.localStorage.removeItem("start-time-streaming");
								}

								$("#tab_streaming").attr("disabled", start_time[time_modes.streaming] == null ? "disabled" : null);
								$("#tab_recording").attr("disabled", start_time[time_modes.recording] == null ? "disabled" : null);
								$("#tab_clock").attr("disabled", (start_time[time_modes.recording] == null && start_time[time_modes.streaming] == null) ? "disabled" : null);
							}

							if (typeof data.key_moments === 'object') {
								key_moments = data.key_moments;
								window.localStorage.setItem("key-moments", JSON.stringify(key_moments));

								$("#order-of-service li").attr("selected", null);
								if (key_moments.length > 0) {
									$("#order-of-service li:nth-child(" + key_moments.length + ")").attr("selected", "selected");
								}
								UpdateKeyMoments();
							}

							EnableAddKeyMoment();
							EnableUndoKeyMoment();
							obs.call("GetCurrentProgramScene").then(data => {
								EnableSetCurrentScene(data.currentProgramSceneName);
							});
							EnableResetKeyMoments();

							if (obs_websocket_host === uuid) {
								SetCurrentScene();
							}
						}
						break;
					default:
				}
			}
		}
	});
});

function EditAutoScenes(enable) {
	document.getElementById("settings").style.display = (enable ? "" : "none");
	if (!enable) {
		auto_scenes = {};
		for (var item of document.getElementById("auto-scenes").children) {
			var service_item = item.children[1].value;
			if (service_item.length > 0) {
				auto_scenes[service_item] = item.children[2].value;
			}
		}
		obs.call("BroadcastCustomEvent", {
			eventData: {
				module: module_name, method: "UPDATE", auto_scenes: auto_scenes
			}
		});
	}
}

function AddAutoScene(service_item) {
	var $auto_scene = $("<div/>", { class: "auto-scene" }).append(
		$("<button/>", {
			class: "remove"
		}).on('click', () => {
			event.currentTarget.parentElement.remove();
		}),
		$("<input/>", {
			type: "text", spellcheck: true,
			placeholder: "Service Item"
		}).val(service_item),
		$("<select/>")
	);
	$("#auto-scenes").append(
		$auto_scene
	);

	PopulateOptions($auto_scene.find("select")[0], scene_names);
}

function PopulateAutoScenes() {
	var auto_scenes_el = document.getElementById("auto-scenes");
	for (var tr of auto_scenes_el.children) {
		var options_el = tr.children[2];
		while (options_el.firstChild) {
			options_el.firstChild.remove();
		}
	}

	obs.call('GetSceneList').then((data) => {
		while (scene_names.length) {
			scene_names.pop();
		}
		for (var scene of data.scenes) {
			scene_names.push(scene.sceneName);
		}
		var rows = document.getElementById("auto-scenes").children;
		for (var tr_idx = 0; tr_idx < rows.length; tr_idx++) {
			var select = rows[tr_idx].children[2];
			PopulateOptions(select, scene_names);

			var service_item = rows[tr_idx].children[1].value;
			if (service_item.length > 0 && typeof auto_scenes[service_item] === 'string') {
				SelectOption(select, auto_scenes[service_item]);
			}
		}
	}, (error) => { console.error(error); });
}

function PopulateOptions(select, options, canDisable) {
	if (canDisable !== false) {
		var el = document.createElement("option");
		el.value = "";
		el.innerText = "--No Change--";
		select.appendChild(el);
	}
	if (typeof options === 'object' && options.length > 0) {
		for (var option of options) {
			var el = document.createElement("option");
			el.value = option;
			el.innerText = option;
			select.appendChild(el);
		}
	}
}

function UpdateOrderOfService() {
	$("#order-of-service").empty();
	if (order_of_service.length > 0) {
		for (var index = 0; index < order_of_service.length; index++) {
			$("#order-of-service").append(CreateServiceItem(order_of_service[index]));
		}
	} else {
		$("#order-of-service").append(CreateServiceItem());
	}

	if (key_moments.length > 0) {
		$("#order-of-service li:nth-child(" + key_moments.length + ")").attr("selected", "selected");
	}
}

function CreateServiceItem(item) {
	$el = $("<li/>", {
		reorder: true,
	}).append(
		$("<span/>", {
			class: "service-item",
			spellcheck: true,
			contentEditable: true,
			"auto-scene": typeof item === 'string' ? auto_scenes[item.split(" - ")[0]] : "",
			text: item
		})
	);
	autocomplete($el.find(".service-item"));
	return $el;
}

function SelectOption(selectElement, optionValToSelect) {
	for (var opt, j = 0; opt = selectElement.children[j]; j++) {
		//If the option of value is equal to the option we want to select.
		if (opt.value == optionValToSelect) {
			//Select the option and break out of the for loop.
			selectElement.selectedIndex = j;
			break;
		}
	}

	// Option not found
}

var countdown_timeout = null;
function EnableAddKeyMoment(duration) {
	if (key_moments.length < order_of_service.length && (streaming || recording)) {
		if (typeof duration === 'number') {
			if (duration > 0) {
				$("#add-key-moment").attr("count-down", Math.ceil(duration / 1000));
				if (countdown_timeout != null) {
					clearTimeout(countdown_timeout);
				}
				var wait = duration % 1 === 0 ? 1000 : duration % 1;
				countdown_timeout = setTimeout(function () {
					duration -= wait;
					EnableAddKeyMoment(duration);
				}, (wait));
			} else {
				if (countdown_timeout != null) {
					clearTimeout(countdown_timeout);
					countdown_timeout = null;
				}
				$("#add-key-moment").removeAttr('count-down');

				document.getElementById("add-key-moment").disabled = false;
			}
		} else {
			if (countdown_timeout != null) {
				clearTimeout(countdown_timeout);
				countdown_timeout = null;
			}
			$("#add-key-moment").removeAttr('count-down');

			var el = document.getElementById("add-key-moment");
			el.disabled = false;
			if (key_moments.length > 0) {
				var key_moment_duration = new Date().getTime() - key_moments[key_moments.length - 1].timecode;
				if (key_moment_duration < 10000) {
					el.disabled = true;
					EnableAddKeyMoment((key_moments[key_moments.length - 1].timecode + 10000 + host_time_offset) - new Date().getTime());
				}
			}
		}
	} else {
		if (countdown_timeout != null) {
			clearTimeout(countdown_timeout);
			countdown_timeout = null;
		}
		$("#add-key-moment").attr("disabled", true);
		$("#add-key-moment").removeAttr('count-down');
	}
}

function AddKeyMoment() {
	if (key_moments.length < order_of_service.length && order_of_service[key_moments.length].length > 0) {
		var timecode = Math.trunc(new Date().getTime());
		var service_item = order_of_service[key_moments.length];
		key_moments.push({ name: service_item, timecode: timecode });
		obs.call("BroadcastCustomEvent", {
			eventData: {
				module: module_name, method: "UPDATE", key_moments: key_moments
			}
		}, (error) => { console.error(error); });
	}
}

function UpdateKeyMoments() {
	var key_moments_text = "";
	for (var i = 0; i < key_moments.length; i++) {
		if (time_mode === time_modes.clock) {
			key_moments_text += (i > 0 ? "\n" : "") + new Date(key_moments[i].timecode).toTimeString().split(' ')[0] + " " + key_moments[i].name;
		} else {
			key_moments_text += (i > 0 ? "\n" : "") + (key_moments[i].timecode - start_time[time_mode]).formatDuration() + " " + key_moments[i].name;
		}
	}
	$("#key-moments").val(key_moments_text);
}

function EnableUndoKeyMoment() {
	$("#undo-key-moment").prop("disabled", key_moments.length <= 1 || !(streaming || recording));
}

function UndoKeyMoment() {
	if (key_moments.length > 0 && confirm("Are you sure you want to undo the last key-moment?")) {
		key_moments.pop();
		window.localStorage.setItem("key-moments", JSON.stringify(key_moments));
		obs.call("BroadcastCustomEvent", {
			eventData: {
				module: module_name, method: "UPDATE", key_moments: key_moments
			}
		});
	}
}

function SetCurrentScene() {
	if (key_moments.length <= order_of_service.length) {
		var service_item = order_of_service[Math.max(0, key_moments.length - 1)].split(" - ")[0];
		if (typeof auto_scenes[service_item] === 'string' && auto_scenes[service_item].length > 0) {
			obs.call('SetCurrentProgramScene', {
				'sceneName': auto_scenes[service_item]
			}, (error) => { console.error(error); });
		}
	}
}

function EnableSetCurrentScene(sceneName) {
	var disabled = true;
	if (key_moments.length <= order_of_service.length && order_of_service.length > 0) {
		var service_item = order_of_service[Math.max(0, key_moments.length - 1)].split(" - ")[0];
		if (typeof auto_scenes[service_item] === 'string' && auto_scenes[service_item].length > 0) {
			disabled = auto_scenes[service_item] === sceneName;
		}
	}
	$("#set-current-scene").attr('disabled', disabled);
}

function SetTimeMode(timemode) {
	$("tabgroup[tab-group=timing] > tab").attr("selected", null);
	$("#tab_" + timemode).attr("selected", "selected");
	time_mode = timemode;
	window.localStorage.setItem("time-mode", time_mode);

	UpdateKeyMoments();
}

function Reset() {
	var show_warning = key_moments.length >= 1 && (streaming || recording);
	if (!show_warning || confirm("Are you sure you want to reset key-moments during a broadcast?")) {
		var min = show_warning ? 1 : 0;
		while (key_moments.length > min) {
			key_moments.pop();
		}

		if (!show_warning) {

			start_time[time_modes.streaming] = null;

			start_time[time_modes.recording] = null;

			time_mode = time_modes.clock;
		}

		obs.call("BroadcastCustomEvent", {
			eventData: {
				module: module_name, method: "UPDATE", key_moments: key_moments, start_time: start_time
			}
		});
	}
}

function EnableResetKeyMoments() {
	var $reset = $("#reset-key-moments");
	if (key_moments.length > 0) {
		$reset.attr("highlight", "highlight");
	} else {
		$reset.attr("highlight", null);
	}
}