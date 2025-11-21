// The main script for the extension
// The following are examples of some basic extension functionality

//You'll likely need to import extension_settings, getContext, and loadExtensionSettings from extensions.js
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";

//You'll likely need to import some other functions from the main script
import { saveSettingsDebounced, saveChatConditional } from "../../../../script.js";

// Keep track of where your extension is located, name should match repo name
const extensionName = "vhelas-status-line";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {};



// Loads the extension settings if they exist, otherwise initializes them to the defaults.
async function loadSettings() {
    //Create the settings if they don't exist
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    // Updating settings in the UI
    //$("#example_setting").prop("checked", extension_settings[extensionName].example_setting).trigger("input");
}

// This function is called when the extension settings are changed in the UI
function onExampleInput(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].example_setting = value;
    saveSettingsDebounced();
}

/*
// This function is called when the button is clicked
function onButtonClick() {
    // You can do whatever you want here
    // Let's make a popup appear with the checked setting
    toastr.info(
        `The checkbox is ${extension_settings[extensionName].example_setting ? "checked" : "not checked"}`,
        "A popup appeared because you clicked the button!"
    );
}
*/

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

function getSaveData() {
    const context = getContext();
    const messages = context.chat;

    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const swipe_id = msg.swipe_id || 0;
        console.log(`[Vhelas] msg, msg.variables[${swipe_id}]:`, msg, msg.variables[swipe_id])
        if (!("vhelas_save" in msg.variables[swipe_id])) {
            continue;
        }

        const save_string = msg.variables[swipe_id].vhelas_save;
        if (!(typeof save_string === "string" || save_string === null)) {
            console.error("[Vhelas] Expected JSON string for SAVE update:", save_string);
            continue;
        }
		return save_string;
    }

    return null;
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
    // Theoretically, we couold quickly update the status bar based off just this single message, if applicable.
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
    console.log(`[Vhelas] context.chat:`, context.chat);
    for (let i = 0; i < context.chat.length; i++) {
        const msg = context.chat[i];
        if ("swipes" in msg) {
            for (let j = 0; j < msg.swipes.length; j++) {
                let results = parseSingleMessageForVhelasTags(msg.swipes[j])
                if ("mes" in results) {
                    msg.swipes[j] = results["mes"];
                    if (j == msg.swipe_id) {
                        msg.mes = msg.swipes[j];
                    }
                    delete results.mes;
                    anythingModified = true;
                }
                if (hasKeys(results)) {
                    Object.assign(msg.variables[j], results);
                    anythingModified = true;
                }
            }
        } else {
            let results = parseSingleMessageForVhelasTags(msg.mes)
            if ("mes" in results) {
                msg.mes = results["mes"];
                delete results.mes;
                anythingModified = true;
            }
            if (hasKeys(results)) {
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
    $("#extensions_settings2").append(settingsHtml);

    $("#top-settings-holder").after(statuslineHtml);

    /*
    // These are examples of listening for events
    $("#my_button").on("click", onButtonClick);
    $("#example_setting").on("input", onExampleInput);
    */

    // Load settings when starting things up (if you have any)
    loadSettings();

    updateStatusBar();

    window.addEventListener('resize', updateStatusBarMetrics);
});

/* We're at load order 3008, so we'll (hopefully) load after anything that cares about contextSize,
   since the save file would bloat the token size infinitely, if it was actually sent to a real LLM
   instead of our IF interpreter. */
globalThis.vhelasInterceptor = async function(chat, contextSize, abort, type) {
    let save_data = getSaveData();
    if (save_data) {
        const systemNote = {
            is_user: false,
            name: "Vhelas",
            send_date: Date.now(),
            mes: `<!--SAVE:"${save_data}"-->`
        };
        chat.unshift(systemNote);
    }
}
