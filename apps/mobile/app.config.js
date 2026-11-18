const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

module.exports = ({ config }) => {
  const variant = process.env.BB_MOBILE_VARIANT ?? "production";
  if (
    variant !== "production" &&
    variant !== "dev" &&
    variant !== "dictation-spike"
  ) {
    throw new Error(
      "BB_MOBILE_VARIANT must be production, dev, or dictation-spike",
    );
  }
  const isDev = variant === "dev";
  const isDictationSpike = variant === "dictation-spike";
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON
    ? resolve(process.env.GOOGLE_SERVICES_JSON)
    : resolve(__dirname, "google-services.json");
  if (
    !isDev &&
    !isDictationSpike &&
    process.env.GOOGLE_SERVICES_JSON &&
    !existsSync(googleServicesFile)
  ) {
    throw new Error(
      "GOOGLE_SERVICES_JSON must point to an existing Firebase configuration file",
    );
  }
  const { eas: linkedEas, ...extraWithoutEas } = config.extra ?? {};
  const extra = {
    ...extraWithoutEas,
    bbMobileVariant: variant,
  };
  if (process.env.EAS_PROJECT_ID) {
    extra.eas = { ...linkedEas, projectId: process.env.EAS_PROJECT_ID };
  } else if (!isDictationSpike && linkedEas) {
    extra.eas = linkedEas;
  }

  const easProjectId = extra.eas?.projectId;
  const easUpdates =
    typeof easProjectId === "string" && easProjectId.length > 0
      ? {
          updates: {
            url: `https://u.expo.dev/${easProjectId}`,
            checkAutomatically: "ON_LOAD",
          },
          runtimeVersion: {
            policy: "appVersion",
          },
        }
      : {};

  return {
    ...config,
    ...easUpdates,
    ...(isDictationSpike ? { slug: "stevu", owner: "benmagg" } : {}),
    extra,
    ...(isDictationSpike
      ? {
          // Reuse the Stevu Expo app + Apple credentials for dictation/CallKit spikes.
          name: "Stevu",
          slug: "stevu",
          scheme: ["bb", "stevu", "com.stevu.app"],
          ios: {
            ...config.ios,
            bundleIdentifier: "com.stevu.app",
            appleTeamId: "6YKJ7MZVX6",
            // Stevu has no bb universal links; drop to avoid entitlement churn.
            associatedDomains: [],
          },
          android: {
            ...config.android,
            package: "com.stevu.app",
            intentFilters: [],
          },
        }
      : {}),
    ...(isDev
      ? {
          name: "bb dev",
          icon: "./assets/icon-dev.png",
          web: { ...config.web, favicon: "./assets/favicon-dev.png" },
          plugins: config.plugins.map((plugin) =>
            Array.isArray(plugin) && plugin[0] === "expo-splash-screen"
              ? [
                  plugin[0],
                  {
                    ...plugin[1],
                    image: "./assets/splash-logo-dev.png",
                    dark: {
                      ...plugin[1].dark,
                      image: "./assets/splash-logo-dev.png",
                    },
                  },
                ]
              : plugin,
          ),
        }
      : {}),
    android: {
      ...config.android,
      ...(isDev
        ? {
            package: "app.getbb.mobile.dev",
            googleServicesFile: undefined,
            intentFilters: [],
            adaptiveIcon: {
              ...config.android.adaptiveIcon,
              foregroundImage: "./assets/android-icon-foreground-dev.png",
            },
          }
        : existsSync(googleServicesFile)
          ? { googleServicesFile }
          : {}),
    },
  };
};
