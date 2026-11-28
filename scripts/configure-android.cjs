// Capacitor generates android/ during CI, so configure the generated project after cap add.
const fs = require('node:fs');
function replace(file, pattern, replacement) {
  const original = fs.readFileSync(file, 'utf8');
  if (!pattern.test(original)) throw new Error(`Expected Android template setting not found in ${file}`);
  fs.writeFileSync(file, original.replace(pattern, replacement));
}
replace('android/variables.gradle', /compileSdkVersion\s*=\s*\d+/, 'compileSdkVersion = 35');
replace('android/variables.gradle', /minSdkVersion\s*=\s*\d+/, 'minSdkVersion = 23');
replace('android/build.gradle', /com\.android\.tools\.build:gradle:[\d.]+/, 'com.android.tools.build:gradle:8.7.2');
replace('android/gradle/wrapper/gradle-wrapper.properties', /gradle-[\d.]+-all\.zip/, 'gradle-8.9-all.zip');
fs.copyFileSync('native/android/BankSmsPlugin.java', 'android/app/src/main/java/com/payday/tracker/BankSmsPlugin.java');
replace('android/app/src/main/java/com/payday/tracker/MainActivity.java', /public class MainActivity extends BridgeActivity \{/, 'public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(BankSmsPlugin.class);\n        super.onCreate(savedInstanceState);\n    }');
replace('android/app/src/main/AndroidManifest.xml', /<application/, '<uses-permission android:name="android.permission.READ_SMS" />\n    <application');
