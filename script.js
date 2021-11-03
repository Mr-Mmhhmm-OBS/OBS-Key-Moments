Number.prototype.padStart = function (size) {
    var s = String(this);
    while (s.length < size) { s = "0" + s; }
    return s;
}

Number.prototype.formatDuration = function () {
    return (Math.floor(this / 60 / 60) % 60).padStart(2) + ":" + (Math.floor(this / 60) % 60).padStart(2) + ":" + (this % 60).padStart(2);
}

String.prototype.toSeconds = function () {
    if (!this) return null; var hms = this.split(':');
    return (+hms[0]) * 60 * 60 + (+hms[1]) * 60 + (+hms[2] || 0);
}

var start_time;
var order_of_service = [];
var key_moments = [];
var auto_scenes = {};
var scene_names = [];

const obs = new OBSWebSocket();
obs.connect().then(() => {
    EnableAddKeyMoment();
    EnableResetKeyMoments();

    obs.on('StreamStarted', data => {
        if (key_moments.length === 0) {
            start_time = Math.trunc(new Date().getTime() / 1000);
            AddKeyMoment(0);
            window.localStorage.setItem("start-time", start_time);
        } else {
            EnableAddKeyMoment();
            EnableResetKeyMoments();
        }

    });
    obs.on('StreamStopped', data => {
        EnableAddKeyMoment();
        EnableResetKeyMoments();
    });
    obs.on('RecordingStarted', data => {
        if (key_moments.length === 0) {
            start_time = Math.trunc(new Date().getTime() / 1000);
            AddKeyMoment(0);
            window.localStorage.setItem("start-time", start_time);
        } else {
            EnableAddKeyMoment();
            EnableResetKeyMoments();
        }
    });
    obs.on('RecordingStopped', data => {
        EnableAddKeyMoment();
        EnableResetKeyMoments();
    });
});

window.onload = function (event) {
    var value = window.localStorage.getItem("order-of-service");
    if (typeof value === 'string' && value.length > 0) {
        order_of_service = JSON.parse(value);
        document.getElementById("editor_order_of_service").value = order_of_service.join('\n');
        for (var item of order_of_service) {
            var el = document.createElement("li");
            el.innerText = item;
            document.getElementById("order-of-service").appendChild(el);
        }
    }

    var value = window.localStorage.getItem("start-time");
    if (typeof value === 'string' && value.length > 0) {
        start_time = parseInt(value);
    }

    var value = window.localStorage.getItem("key-moments");
    if (typeof value === 'string' && value.length > 0) {
        key_moments = JSON.parse(value);
        var el = document.getElementById("key-moments");
        for (var i = 0; i < key_moments.length; i++) {
            el.value += (i > 0 ? "\n" : "") + key_moments[i].timecode.formatDuration() + " " + key_moments[i].name;
        }
    }
    if (key_moments.length > 0) {
        document.getElementById("order-of-service").children[key_moments.length - 1].setAttribute("selected", "selected");
    }

    var value = window.localStorage.getItem("auto-scenes");
    if (typeof value === 'string' && value.length > 0) {
        auto_scenes = JSON.parse(value);
        for (var service_item in auto_scenes) {
            AddAutoScene(service_item);
        }
    }
    //document.getElementById("text").innerHTML = window.obsstudio.pluginVersion;

    document.addEventListener("keydown", function (event){
        if (event.key === 'd') {
            console.log("got it");
        }
});
}

function EditService(enable) {
    document.getElementById("service-editor").style.display = (enable ? "" : "none");
    if (!enable) {
        var div = document.getElementById("order-of-service");
        while (div.firstChild) {
            div.firstChild.remove();
        }

        order_of_service = document.getElementById("editor_order_of_service").value.split("\n").filter(e => e);
        window.localStorage.setItem("order-of-service", JSON.stringify(order_of_service));
        for (var item of order_of_service) {
            var el = document.createElement("li");
            el.innerText = item;
            div.appendChild(el);
        }

        EnableAddKeyMoment();
    }
}

function EditAutoScenes(enable) {
    document.getElementById("auto-scenes-editor").style.display = (enable ? "" : "none");
    if (enable) {
        var auto_scenes_el = document.getElementById("auto-scenes");
        for (var tr of auto_scenes_el.children) {
            var options_el = tr.children[1].firstChild;
            while (options_el.firstChild) {
                options_el.firstChild.remove();
            }
        }
        obs.send('GetSceneList').then((data) => {
            while (scene_names.length) {
                scene_names.pop();
            }
            for (var scene of data.scenes) {
                scene_names.push(scene.name);
            }
            var rows = document.getElementById("auto-scenes").children;
            for (var tr_idx = 0; tr_idx < rows.length; tr_idx++) {
                var select = rows[tr_idx].children[1].firstChild;
                PopulateOptions(select, scene_names);

                var service_item = rows[tr_idx].children[0].firstChild.value;
                if (service_item.length > 0 && typeof auto_scenes[service_item] === 'string') {
                    SelectOption(select, auto_scenes[service_item]);
                }
            }
        });
    } else {
        auto_scenes = {};
        for (var item of document.getElementById("auto-scenes").children) {
            var service_item = item.cells[0].firstChild.value;
            if (service_item.length > 0) {
                auto_scenes[service_item] = item.cells[1].firstChild.value;
            }
        }
        window.localStorage.setItem("auto-scenes", JSON.stringify(auto_scenes));
    }
}

function PopulateOptions(select, options, canDisable) {
    if (canDisable !== false) {
        var el = document.createElement("option");
        el.value = "";
        el.innerText = "--Disabled--";
        select.appendChild(el);
    }
    for (var option of options) {
        var el = document.createElement("option");
        el.value = option;
        el.innerText = option;
        select.appendChild(el);
    }
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
}

function AddAutoScene(service_item) {
    var tr = document.createElement("tr");
    tr.className = "auto-scene";
    var td = document.createElement("td");
    var input = document.createElement("input");
    input.type = "text";
    if (typeof service_item === 'string' && service_item.length > 0) {
        input.value = service_item;
    }
    td.appendChild(input);
    tr.appendChild(td);

    var td = document.createElement("td");
    var select = document.createElement("select");
    PopulateOptions(select, scene_names);
    td.appendChild(select);
    tr.appendChild(td);

    var td = document.createElement("td");
    var button = document.createElement("button");
    button.className = "remove";
    button.onclick = RemoveAutoScene;
    td.appendChild(button);
    tr.appendChild(td);

    document.getElementById("auto-scenes").appendChild(tr);
}

function RemoveAutoScene(event) {
    event.currentTarget.parentElement.parentElement.remove();
}

function EnableAddKeyMoment() {
    obs.send("GetStreamingStatus").then((data) => {
        var el = document.getElementById("add_key_moment");
        var disabled = key_moments.length >= order_of_service.length || (data.recording === false && data.streaming === false);
        el.disabled = disabled;
        if (!disabled && key_moments.length > 0 && Math.trunc(new Date().getTime() / 1000) - (start_time + key_moments[key_moments.length - 1].timecode) < 10) {
            el.disabled = true;
            setTimeout(
                function () {
                    EnableAddKeyMoment();
                }, (start_time + key_moments[key_moments.length - 1].timecode) - (new Date().getTime() / 1000));
        }
    });
}

function EnableResetKeyMoments() {
    obs.send("GetStreamingStatus").then((data) => {
        var disabled = key_moments.length === 0 || data.recording === true || data.streaming === true;

        var el = document.getElementById("reset-key-moments");
        if (!disabled && key_moments.length >= order_of_service.length) {
            document.getElementById("key-moments").setAttribute("highlight", "highlight");
            el.setAttribute("highlight", "highlight");
        } else {
            document.getElementById("key-moments").removeAttribute("highlight");
            el.removeAttribute("highlight");
        }
        el.disabled = disabled;
    });
}

function AddKeyMoment(timecode) {
    if (key_moments.length < order_of_service.length) {
        if (key_moments.length > 0) {
            document.getElementById("order-of-service").children[key_moments.length - 1].removeAttribute("selected");
        }
        document.getElementById("order-of-service").children[key_moments.length].setAttribute("selected", "selected");
        var el = document.getElementById("key-moments");
        if (typeof timecode !== 'number') {
            var timecode = Math.trunc(new Date().getTime() / 1000) - start_time;
        }
        var service_item = order_of_service[key_moments.length];
        el.value += (key_moments.length > 0 ? "\n" : "") + timecode.formatDuration() + " " + service_item;
        el.scrollTop = el.scrollHeight
        if (typeof auto_scenes[service_item] === 'string' && auto_scenes[service_item].length > 0) {
            obs.send('SetCurrentScene', { 'scene-name': auto_scenes[service_item] });
        }
        key_moments.push({ name: service_item, timecode: timecode });
        window.localStorage.setItem("key-moments", JSON.stringify(key_moments));
        EnableResetKeyMoments();

        document.getElementById("add_key_moment").disabled = "disabled";
        setTimeout(
            function () {
                EnableAddKeyMoment();
            }, 10000);
    }
}

function Reset() {
    if (key_moments.length > 0) {
        document.getElementById("order-of-service").children[key_moments.length - 1].removeAttribute("selected");
    }
    window.localStorage.removeItem("key-moments");
    document.getElementById("key-moments").value = "";

    while (key_moments.length) {
        key_moments.pop();
    }
    EnableAddKeyMoment();
    EnableResetKeyMoments();
}