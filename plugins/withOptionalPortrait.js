const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withOptionalPortrait(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-feature'] = manifest['uses-feature'] || [];

    const features = manifest['uses-feature'];
    const existing = features.find(
      (f) => f.$['android:name'] === 'android.hardware.screen.portrait'
    );

    if (existing) {
      existing.$['android:required'] = 'false';
    } else {
      features.push({
        $: {
          'android:name': 'android.hardware.screen.portrait',
          'android:required': 'false',
        },
      });
    }
    return cfg;
  });
};
