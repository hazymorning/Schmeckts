plugins {
    id("com.android.application") version "9.5.1"
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.21"
    id("org.jlleitschuh.gradle.ktlint") version "14.2.0"
    id("io.github.takahirom.roborazzi") version "1.79.0"
}

val appVersion = version.toString()

android {
    namespace = "de.schmeckts.app"
    compileSdk = 37
    defaultConfig {
        applicationId = "de.schmeckts.app"
        minSdk = 24
        targetSdk = 36
        versionName = appVersion
        versionCode = 20000 + appVersion.split(".").fold(0) { acc, n -> acc * 100 + n.toInt() }
        ndk { abiFilters += listOf("armeabi-v7a", "arm64-v8a") }
    }
    buildFeatures { compose = true }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            all {
                it.systemProperty("robolectric.dependency.repo.url", "https://maven-central.storage-download.googleapis.com/maven2")
                it.jvmArgs("--add-exports=java.base/jdk.internal.access=ALL-UNNAMED") // Robolectric on JDK 21
            }
        }
    }
}

dependencies {
    val bom = platform("androidx.compose:compose-bom:2026.09.00")
    implementation(bom)
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.core:core-ktx:1.19.1")
    implementation("androidx.core:core-splashscreen:1.2.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    implementation("androidx.camera:camera-camera2:1.6.2")
    implementation("androidx.camera:camera-lifecycle:1.6.2")
    implementation("androidx.camera:camera-compose:1.6.2")
    implementation("androidx.exifinterface:exifinterface:1.4.2")
    implementation("com.google.mlkit:text-recognition:16.0.1")
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    implementation("com.google.android.gms:play-services-base:18.11.1")
    implementation("com.squareup.okhttp3:okhttp:5.5.1")
    implementation("com.squareup.okhttp3:okhttp-sse:5.5.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.13.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    testImplementation(bom)
    testImplementation("androidx.compose.ui:ui-test-junit4")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.17")
    testImplementation("io.github.takahirom.roborazzi:roborazzi:1.79.0")
    testImplementation("com.squareup.okhttp3:mockwebserver3:5.5.1")
}
