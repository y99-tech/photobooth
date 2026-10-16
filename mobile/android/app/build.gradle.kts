plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Version comes from the booth (desktop/package.json) so the app and the booth match.
val boothVersion: String = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"")
    .find(rootProject.file("../../desktop/package.json").readText())?.groupValues?.get(1) ?: "1.0.0"
val parts = boothVersion.split(".").map { it.toIntOrNull() ?: 0 } + listOf(0, 0, 0)

android {
    namespace = "app.photobooth.remote"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.photobooth.remote"
        minSdk = 26
        targetSdk = 35
        versionCode = parts[0] * 10000 + parts[1] * 100 + parts[2]
        versionName = boothVersion
    }

    // Release builds are signed with the key in the ANDROID_KEYSTORE_* environment variables
    // (GitHub secrets). Without them they are signed with the debug key so they still install.
    signingConfigs {
        create("release") {
            val store = System.getenv("ANDROID_KEYSTORE_FILE")
            if (store != null && file(store).exists()) {
                storeFile = file(store)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            } else {
                val debug = getByName("debug")
                storeFile = debug.storeFile
                storePassword = debug.storePassword
                keyAlias = debug.keyAlias
                keyPassword = debug.keyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}
