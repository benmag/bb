const { withInfoPlist } = require("expo/config-plugins");

/** Ensures Info.plist keys required for Nitro Speech + background dictation. */
function withVoiceDictation(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIBackgroundModes = Array.from(
      new Set([
        ...(cfg.modResults.UIBackgroundModes ?? []),
        "voip",
        "audio",
      ]),
    );
    cfg.modResults.NSSpeechRecognitionUsageDescription =
      cfg.modResults.NSSpeechRecognitionUsageDescription ??
      "bb converts your speech to text in the composer while you dictate.";
    return cfg;
  });
}

module.exports = withVoiceDictation;