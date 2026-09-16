var SafariExtensionCommunicator = (function (msgHandler) {
    'use strict'
    var publicAPI = {}

    // Connect the provided message handler to the received messages.
    safari.self.addEventListener("message", msgHandler)

    var sendMessage = function(msgName) {
        safari.extension.dispatchMessage(msgName)
    }

    publicAPI.requestSettingsUpdate = function() {
        sendMessage("updateSettings")
    }
    publicAPI.requestTabForward = function() {
        sendMessage("tabForward")
    }
    publicAPI.requestTabBackward = function() {
        sendMessage("tabBackward")
    }
    publicAPI.requestCloseTab = function () {
        sendMessage("closeTab")
    }
    publicAPI.requestTabList = function() {
        sendMessage("requestTabList")
    }
    publicAPI.requestActivateTab = function(index) {
        safari.extension.dispatchMessage("activateTab", { index: index })
    }

    // Return only the public methods.
    return publicAPI;
});
