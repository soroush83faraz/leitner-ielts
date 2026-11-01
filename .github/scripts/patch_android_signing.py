"""Run after `expo prebuild`: sign the release build with the project keystore and build only phone ABIs."""
import re

RELEASE = """        release {
            storeFile file(System.getenv('LEITNER_KEYSTORE'))
            storePassword System.getenv('LEITNER_KEYSTORE_PASSWORD')
            keyAlias 'leitner'
            keyPassword System.getenv('LEITNER_KEYSTORE_PASSWORD')
            storeType 'PKCS12'
        }
"""

p = 'android/app/build.gradle'
s = open(p).read()
assert 'signingConfigs {' in s, 'signingConfigs block not found'
s = s.replace('signingConfigs {\n', 'signingConfigs {\n' + RELEASE, 1)
# only the release build type switches away from the debug key
s, n = re.subn(r'(release \{[^}]*?)signingConfig signingConfigs\.debug', r'\1signingConfig signingConfigs.release', s, count=1, flags=re.S)
assert n == 1, 'release signingConfig not patched'
open(p, 'w').write(s)

g = 'android/gradle.properties'
t = open(g).read().replace('-Xmx2048m', '-Xmx4096m')
t = re.sub(r'reactNativeArchitectures=.*', 'reactNativeArchitectures=arm64-v8a,armeabi-v7a', t)
open(g, 'w').write(t)
print('patched signing + ABIs')
