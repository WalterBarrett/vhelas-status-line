import { extension_settings, getContext } from "../../../extensions.js";
import { processDroppedFiles, saveChatConditional, saveSettingsDebounced } from "../../../../script.js";
import { getUserAvatar, user_avatar } from '../../../personas.js';
import { power_user } from '../../../power-user.js';

// Keep track of where your extension is located, name should match repo name
const extensionName = "vhelas-status-line";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const settings_registry = {
    "enabled": {
        "name": "Enabled",
        "type": "checkbox",
        "default": true,
    },
    "parser_augmentation": {
        "name": "Parser Augmentation",
        "description": "The type of parser augmentation to use.",
        "type": "radio",
        "default": "rules",
        "values": {
            "disabled": {
                "title": "Disabled",
                "description": "Passes the raw user input along.",
            },
            "rules": {
                "title": "Rules-Based",
                "description": "Handles <i>incredibly</i> simple cases like converting \"I take the card.\" to \"take the card\". Incredibly fast but <i>incredibly</i> limited.",
            },
            "nlp": {
                "title": "Use Natural Language Processing",
                "description": "Handles simple cases like converting \"I take the card.\" to \"take card\". Theoretically faster.",
            },
            "llm": {
                "title": "Use Large Language Model",
                "description": "Handles complex cases like converting \"I swiftly slide the metallic-looking rectangle into my pocket.\" to \"take card\". Theoretically slower.",
            },
        }
    },
    "output_augmentation": {
        "name": "Output Augmentation",
        "description": "The type of output augmentation to use.",
        "type": "radio",
        "default": "disabled",
        "values": {
            "disabled": {
                "title": "Disabled",
                "description": "Returns the raw text from the interpreter.",
            },
            "rewrite": {
                "title": "Large Language Model-based Rewrite",
                "description": "Uses an LLM to rewrite the output, without any mechanism to modify worldstate.",
            },
            "worldstatemodification": {
                "title": "Large Language Model-based world-state modification",
                "description": "Uses an LLM to rewrite the output, and attempts to allow the LLM to modify worldstate by sending commands behind-the-scenes.",
            },
        }
    },
    "api_key": {
        "name": "API Key",
        "type": "secret",
        "default": "",
        "placeholder": "Vhelas API Key",
        "description": "API Key to send to custom Vhelas endpoints.",
    },
    /*
    "test_button": {
        "name": "Test Button",
        "description": "Pops up a test toast.",
        "type": "button",
        "proc": () => toastr.info("Test message body.", "Test Title"),
    },
    "test_line": {
        "name": "Test Line of Text",
        "type": "text",
        "default": "Line of text.",
    },
    "test_textarea": {
        "name": "Test Paragraph of Text",
        "type": "textarea",
        "default": "A paragraph of text!\n\nThe text keeps coming and it don't stop coming!",
        "description": "An example text area.",
    },
    "test_code": {
        "name": "Test Block of Code",
        "type": "code",
        "default": "{\n    \"test\": \"Test.\"\n}\n",
        "description": "An example code block.",
    },
    "test_secret": {
        "name": "Test Secret",
        "type": "secret",
        "placeholder": "The most secret text.",
        "description": "An example secret.",
    },
    */
};

function getSetting(key) {
    let value = extension_settings[extensionName][key];
    if (value != undefined) { return value; }
    return settings_registry[key].default;
}

function setSetting(key, value) {
    let oldValue = extension_settings[extensionName][key];
    if (oldValue == value) { return; }
    extension_settings[extensionName][key] = value;
    saveSettingsDebounced();
}

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    const settings_drawer = $("#vhelas-settings-drawer");
    for (const [key, setting] of Object.entries(settings_registry)) {
        const inputId = `vhelas_setting_${key}`;
        const placeholder = setting.placeholder || setting.default;
        const description = setting.description || "";
        switch (setting.type) {
            case "checkbox": {
                const container = $("<div>").addClass("flex-container");
                const input = $("<input>")
                    .attr("id", inputId)
                    .attr("type", "checkbox")
                    .prop("checked", getSetting(key))
                    .on("change", function () { setSetting(key, this.checked); });
                const label = $("<label>").attr("for", inputId).text(setting.name);
                container.append(input, label);
                settings_drawer.append(container);
                break;
            }
            case "radio": {
                const header = $("<h4>").text(setting.name);
                settings_drawer.append(header);
                if (description) {
                    settings_drawer.append($("<div>").addClass("marginTopBot5").html(description));
                }
                const currentValue = getSetting(key);
                for (const [valKey, valDef] of Object.entries(setting.values)) {
                    const valInputId = `vhelas_setting_${key}_${valKey}`;
                    const label = $("<label>").attr("for", valInputId).addClass("checkbox_label");
                    const input = $("<input>")
                        .attr("id", valInputId)
                        .attr("type", "radio")
                        .attr("name", inputId)
                        .attr("value", valKey)
                        .prop("checked", currentValue === valKey)
                        .on("change", function () { setSetting(key, this.value); });
                    const span = $("<span>").html(`<b>${valDef.title}:</b> ${valDef.description || ""}`);
                    label.append(input, span);
                    settings_drawer.append(label);
                }
                break;
            }
            case "text":
            case "secret": {
                if (!description) {
                    const label = $("<label>").attr("for", inputId);
                    $("<h4>").text(setting.name).appendTo(label);
                    label.appendTo(settings_drawer);
                } else {
                    $("<h4>").text(setting.name).appendTo(settings_drawer);
                    $("<div>").addClass("marginTopBot5").html(description).appendTo(settings_drawer);
                }
                const input = $("<input>")
                    .attr("id", inputId)
                    .addClass("text_pole")
                    .attr("placeholder", placeholder)
                    .val(getSetting(key))
                    .on("input", function () { setSetting(key, this.value); })
                    .appendTo(settings_drawer);
                if (setting.type == "secret") {
                    input.attr("type", "password");
                    input.attr("autocomplete", "off");
                    input.attr("spellcheck", "false");
                    input.attr("data-lpignore", "true");
                    input.attr("data-1p-ignore", "true");
                }
                break;
            }
            case "textarea":
            case "code": {
                if (!description) {
                    const label = $("<label>").attr("for", inputId);
                    $("<h4>").text(setting.name).appendTo(label);
                    label.appendTo(settings_drawer);
                } else {
                    $("<h4>").text(setting.name).appendTo(settings_drawer);
                    $("<div>").addClass("marginTopBot5").html(description).appendTo(settings_drawer);
                }
                const textarea = $("<textarea>")
                    .attr("id", inputId)
                    .addClass("text_pole textarea_compact autoSetHeight")
                    .attr("rows", 2)
                    .attr("placeholder", placeholder)
                    .val(getSetting(key))
                    .on("input", function () { setSetting(key, this.value); });
                if (setting.type == "code") {
                    textarea.addClass("monospace");
                }
                settings_drawer.append(textarea);
                break;
            }
            case "button": {
                const button = $("<div>")
                    .attr("id", inputId)
                    .addClass("menu_button menu_button_icon interactable")
                    .attr("title", description)
                    .attr("role", "button")
                    .text(setting.name)
                    .on("click", setting.proc);
                settings_drawer.append(button);
                break;
            }
        }
    }
}

function fnv1a_64(str) {
    const fnvPrime = 0x100000001b3n;
    let hash = 0xcbf29ce484222325n;

    const encoder = new TextEncoder(); // UTF-8
    const bytes = encoder.encode(str);

    for (const byte of bytes) {
        hash ^= BigInt(byte);
        hash = (hash * fnvPrime) & ((1n << 64n) - 1n); // mod 2^64
    }

    return hash.toString();
}

function getTextForValue(value) {
    if (value === null) {
        return "";
    }
    return String(value);
}

function hasKeys(obj) {
    for (const _ in obj) {
        return true;
    }
    return false;
}

function getVariableFromMessage(msg, variable) {
    return msg.variables[msg.swipe_id || 0][`vhelas_${variable}`] ?? undefined;
}

function hasGame() {
    const context = getContext();
    const messages = context.chat;
    for (let i = 0; i < messages.length; i++) {
        if (getVariableFromMessage(messages[i], "game")) {
            return true;
        }
    }

    return false;
}

function clearTags(obj, prefix) {
    for (const key in obj) {
        if (key.startsWith(prefix)) {
            delete obj[key];
        }
    }
}

function getPersona() {
    return power_user.personas[user_avatar];
}

function updateStatusBar() {
    const context = getContext();
    const messages = context.chat;

    let left = "";
    let center = ""; // getCharacterName() || "SillyTavern";
    let right = "";

    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const swipe_id = msg.swipe_id || 0;
        if (!("vhelas_status" in msg.variables[swipe_id])) {
            continue;
        }

        const status_array = msg.variables[swipe_id].vhelas_status;
        if (!Array.isArray(status_array) || !(status_array.every(el => typeof el === "string" || typeof el === "number" || el === null))) {
            console.error("[Vhelas] Expected JSON array for STATUS update:", status_array);
            continue;
        }
        if (status_array.length > 3) {
            console.error("[Vhelas] JSON array for STATUS update too long:", status_array);
            continue;
        } else if (status_array.length < 1) { // In case JavaScript invents negatively-sized arrays.
            console.error("[Vhelas] JSON array for STATUS update too short:", status_array);
            continue;
        } else if (status_array.length == 3) {
            left = getTextForValue(status_array[0]);
            center = getTextForValue(status_array[1]);
            right = getTextForValue(status_array[2]);
        } else if (status_array.length == 2) {
            left = getTextForValue(status_array[0]);
            center = getTextForValue("");
            right = getTextForValue(status_array[1]);
        } else if (status_array.length == 1) {
            left = getTextForValue("");
            center = getTextForValue(status_array[0]);
            right = getTextForValue("");
        }
        break;
    }

    $("#vhelas-top-left").text(left);
    $("#vhelas-top-center").text(center);
    $("#vhelas-top-right").text(right);

    let left_set   = left.length > 0;
    let center_set = center.length > 0;
    let right_set  = right.length > 0;

    if (left_set && !center_set && right_set) {
        $("#vhelas-top-left, #vhelas-top-right").css("display", "block");
        $("#vhelas-top-center").css("display", "none");
    } else if (!left_set && center_set && !right_set) {
        $("#vhelas-top-left, #vhelas-top-right").css("display", "none");
        $("#vhelas-top-center").css("display", "block");
    } else {
        $("#vhelas-top-left, #vhelas-top-center, #vhelas-top-right").css("display", "block");
    }
    updateStatusBarMetrics();
}

function updateStatusBarMetrics() {
    let left_set   = $("#vhelas-top-left").text().length > 0;
    let center_set = $("#vhelas-top-center").text().length > 0;
    let right_set  = $("#vhelas-top-right").text().length > 0;

    let maxHeight = 0;
    if (!left_set && !center_set && !right_set) {
        $("#vhelas-status-line").css("display", "none");
    } else {
        $("#vhelas-status-line").css("display", "flex");
        $('#vhelas-status-line').children().each(function() {
            let h = $(this).outerHeight(); // includes padding + border
            if (h > maxHeight) {
                maxHeight = h;
            }
        });
    }

    document.documentElement.style.setProperty('--statusBarHeight', maxHeight + 'px');
}

function getCharacterName() {
    const context = getContext();
    const character = context?.characters[context.characterId];
    const charName = character?.name || null;
    return charName;
}

function onCharacterUpdate() {
    parseAllMessagesForVhelasTags();
    updateStatusBar();
}

function onMostRecentMessageUpdate() {
    // Theoretically, we could quickly update the status bar based off just this single message, if applicable.
    // For now, we'll just hope this is fast enough:
    onNthMessageUpdate();
}

function onNthMessageUpdate() {
    console.log('[Vhelas] onNthMessageUpdate');
    parseAllMessagesForVhelasTags();
    updateStatusBar();
}

function parseSingleMessageForVhelasTags(msg_text) {
    let results = {};

    if (!msg_text.includes("<!--")) {
        return results;
    }

    const tagHandlers = {
        STATUS: {
            validate: (parsed) =>
                Array.isArray(parsed) &&
                parsed.length >= 1 &&
                parsed.length <= 3 &&
                parsed.every(el => typeof el === "string" || typeof el === "number" || el === null),
            assign: (parsed) => ({ vhelas_status: parsed })
        },
        SAVE: {
            validate: (parsed) => typeof parsed === "string",
            assign: (parsed) => ({ vhelas_save: parsed })
        },
        INPUT: {
            validate: (parsed) =>
                (typeof parsed === "string") ||
                (Array.isArray(parsed) && parsed.every(el => typeof el === "string" || typeof el === "number" || el === null)
            ),
            assign: (parsed) => ({ vhelas_input: parsed })
        },
        GAME: {
            validate: (parsed) => typeof parsed === "string",
            assign: (parsed) => ({ vhelas_game: parsed })
        },
        GAMESTART: {
            validate: (parsed) => typeof parsed === "boolean",
            assign: (parsed) => ({ vhelas_gamestart: parsed })
        }
    };

    for (const [tagName, { validate, assign }] of Object.entries(tagHandlers)) {
        const marker = `<!--${tagName}:`;
        if (msg_text.includes(marker)) {
            const regex = new RegExp(`<!--${tagName}:([\\s\\S]*?)-->`, "g");
            const matches = [...msg_text.matchAll(regex)];
            for (let j = matches.length - 1; j >= 0; j--) {
                const inner = matches[j][1];
                try {
                    const parsed = JSON.parse(inner);
                    if (!validate(parsed)) {
                        console.error(`[Vhelas] Validation failed for ${tagName} marker:`, inner);
                        continue;
                    }
                    Object.assign(results, assign(parsed));
                    results.mes = msg_text = msg_text.replace(regex, "").trim();
                    break;
                } catch (err) {
                    console.error(`[Vhelas] Invalid JSON in ${tagName} marker:`, inner);
                }
            }
        }
    }

    return results;
}

function parseAllMessagesForVhelasTags() {
    const context = getContext();
    let anythingModified = false;
    for (let i = 0; i < context.chat.length; i++) {
        const msg = context.chat[i];
        if (msg.is_user) {
            clearTags(msg.variables[0], "vhelas_")
        }
        if ("swipes" in msg) {
            for (let j = 0; j < msg.swipes.length; j++) {
                const results = parseSingleMessageForVhelasTags(msg.swipes[j])
                if (hasKeys(results)) {
                    clearTags(msg.variables[j], "vhelas_")
                    if ("mes" in results) {
                        msg.swipes[j] = results["mes"];
                        if (j == msg.swipe_id) {
                            msg.mes = msg.swipes[j];
                        }
                        delete results.mes;
                        anythingModified = true;
                    }
                    Object.assign(msg.variables[j], results);
                    anythingModified = true;
                }
            }
        } else {
            const results = parseSingleMessageForVhelasTags(msg.mes)
            if (hasKeys(results)) {
                clearTags(msg.variables[0], "vhelas_")
                if ("mes" in results) {
                    msg.mes = results["mes"];
                    delete results.mes;
                    anythingModified = true;
                }
                Object.assign(msg.variables[0], results);
                anythingModified = true;
            }
        }
    }

    if (anythingModified) {
        saveChatConditional();
    }
}

// This function is called when the extension is loaded
jQuery(async () => {
    const context = getContext();
    console.log("[Vhelas] Extension initializing.");
    context.eventSource.on(context.eventTypes.CHARACTER_PAGE_LOADED, onCharacterUpdate);
    context.eventSource.on(context.eventTypes.CHARACTER_RENAMED, onCharacterUpdate);
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, onCharacterUpdate);

    context.eventSource.on(context.eventTypes.CHARACTER_PAGE_LOADED, onNthMessageUpdate);
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, onNthMessageUpdate);
    context.eventSource.on(context.eventTypes.MESSAGE_SWIPED, onMostRecentMessageUpdate); // Swipes can only be the most recent assistant message in SillyTavern.
    context.eventSource.on(context.eventTypes.MESSAGE_SENT, onMostRecentMessageUpdate);
    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, onMostRecentMessageUpdate);
    context.eventSource.on(context.eventTypes.MESSAGE_EDITED, onNthMessageUpdate);
    context.eventSource.on(context.eventTypes.MESSAGE_DELETED, onNthMessageUpdate);
    context.eventSource.on(context.eventTypes.MESSAGE_UPDATED, onNthMessageUpdate);
    context.eventSource.on(context.eventTypes.MESSAGE_FILE_EMBEDDED, onNthMessageUpdate);
    //context.eventSource.on(context.eventTypes.MESSAGE_REASONING_EDITED, onNthMessageUpdate);
    //context.eventSource.on(context.eventTypes.MESSAGE_REASONING_DELETED, onNthMessageUpdate);
    context.eventSource.on(context.eventTypes.MESSAGE_SWIPE_DELETED, onNthMessageUpdate);
    context.eventSource.on(context.eventTypes.CHARACTER_FIRST_MESSAGE_SELECTED, onMostRecentMessageUpdate);

    // This is an example of loading HTML from a file
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    const statuslineHtml = await $.get(`${extensionFolderPath}/statusline.html`);

    // Append settingsHtml to extensions_settings
    // extension_settings and extensions_settings2 are the left and right columns of the settings menu
    // Left should be extensions that deal with system functions and right should be visual/UI related
    $("#extensions_settings").append(settingsHtml);
    $("#top-settings-holder").after(statuslineHtml);

    const addGameButton = $("<div>")
        .attr("id", "vhelas-add-game")
        .addClass("menu_button fa-solid fa-address-book interactable")
        .attr("role", "button")
        .on("click", openGameList);
    $("#character_sort_order").before(addGameButton);

    loadSettings();

    updateStatusBar();

    window.addEventListener('resize', updateStatusBarMetrics);
});

function getHeaders(isJson = true) {
    const headers = {
    };

    if (isJson) {
        headers["Content-Type"] = "application/json";
    }

    const apiKey = getSetting("api_key");
    if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
    }

    return headers;
}

async function postData(name, data) {
    const ccs = getContext().chatCompletionSettings;
    if (typeof data != "string") {
        data = JSON.stringify(data);
    }
    let hash = fnv1a_64(data);
    try {
        const endpoint = `${ccs.custom_url}/vhelas/${name}`;
        let sent_data = {
            "hash": hash,
            "data": data,
        };
        //console.log(`[Vhelas] Sending ${name} data to ${endpoint}:`, sent_data);
        console.log(`[Vhelas] Sending ${name} data to ${endpoint}.`);

        await fetch(endpoint, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify(sent_data)
        });
    } catch (err) {
        console.error(`[Vhelas] Failed to POST ${name} data:`, err);
    }
    return hash;
}

globalThis.vhelasInterceptor = async function(chat, contextSize, abort, type) {
    if (getSetting("enabled") && hasGame()) {
        console.log(`[Vhelas] Has game.`);
        const context = getContext();
        const ccs = context.chatCompletionSettings;
        if (ccs.chat_completion_source !== "custom") {
            console.error(`[Vhelas] Chat Completion Source is "${ccs.chat_completion_source}", not "custom". Aborting.`);
            abort();
            return;
        }
        let new_chat = []
        const data = {
            "game": null,
            "parser_aug": getSetting("parser_augmentation"),
            "output_aug": getSetting("output_augmentation"),
        };
        let inputs = [];
        let saveData = null;
        let gameStart = false;
        for (const msg of chat) {
            const cloned = structuredClone(msg);

            const var_input = getVariableFromMessage(msg, "input");
            if (var_input !== undefined) {
                if (Array.isArray(var_input)) {
                    inputs.push(...var_input);
                } else {
                    inputs.push(var_input);
                }
            }

            const var_game = getVariableFromMessage(msg, "game");
            if (var_game !== undefined) {
                data.game = var_game;
            }

            const var_gamestart = getVariableFromMessage(msg, "gamestart");
            if (var_gamestart !== undefined) {
                gameStart = var_gamestart;
            }

            const var_save = getVariableFromMessage(msg, "save");
            if (var_save !== undefined) {
                saveData = var_save;
            }

            new_chat.push(cloned);
        }

        if (!gameStart) {
            inputs = null;
        }

        if (saveData) {
            data.save = await postData("save", saveData);
        }

        if (inputs) {
            data.inputs = await postData("input", inputs);
        }

        new_chat.unshift({
            is_user: false,
            name: "Vhelas",
            send_date: Date.now(),
            mes: `<!--DATA:${JSON.stringify(data)}-->`
        })

        chat.length = 0;
        chat.push(...new_chat);
    }
}

async function downloadGameCharacterCard(game) {
    const context = getContext();
    const endpoint = `${context.chatCompletionSettings.custom_url}/vhelas/games/${game}`;
    try {
        processDroppedFiles([new File([await (await fetch(endpoint, {
            method: "GET",
            headers: getHeaders(),
        })).blob()], `${game}.json`, { type: "application/json" })]);
    } catch (err) {
        console.error(`[Vhelas] Failed to GET ${endpoint}:`, err);
    }
}

async function openGameList() {
    const context = getContext();
    const endpoint = `${context.chatCompletionSettings.custom_url}/vhelas/games`;
    try {
        const data = await (await fetch(endpoint, {
            method: "GET",
            headers: getHeaders(),
        })).json();
        const card_container = $("<div>").addClass("vhelas-card-container");
        Object.entries(data).forEach(([key, game]) => {
            const card = $("<div>").addClass("vhelas-card");
            const card_header = $("<div>").addClass("vhelas-card-header").appendTo(card);
            let game_name = game.name.replace("{{user}}", getPersona());
            $("<a>").text(game_name).attr("title", game_name).attr("href", "#").on("click", () => downloadGameCharacterCard(key)).appendTo(card_header);
            const card_body = $("<div>").addClass("vhelas-card-body").appendTo(card);
            if (game.cover) {
                $("<img>").attr("src", `${endpoint}/${key}/cover`).attr("alt", game_name + " cover").appendTo(card_body);
            }
            $("<div>").addClass("vhelas-card-description").html(game.description).appendTo(card_body);
            $("<div>").addClass("vhelas-card-footer").text(game.author).appendTo(card);
            card.appendTo(card_container);
        });
        context.callGenericPopup(card_container, context.POPUP_TYPE.TEXT, '', {
            wide: true,
            large: true,
            allowVerticalScrolling: true,
            allowHorizontalScrolling: false,
            transparent: false,
        });
    } catch (err) {
        console.error(`[Vhelas] Failed to GET ${endpoint}:`, err);
    }
}
