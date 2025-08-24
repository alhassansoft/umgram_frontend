// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// حلّ عدم إيجاد مسار "missing-asset-registry-path" لأيقونات Expo على الويب
config.resolver = config.resolver || {};
config.resolver.alias = {
  ...(config.resolver.alias || {}),
  'missing-asset-registry-path': 'react-native-web/dist/modules/AssetRegistry/index.js',
};

module.exports = config;
