import com.android.build.api.variant.FilterConfiguration
import groovy.json.JsonSlurper
import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val appVersion = (JsonSlurper().parse(file("../../../tauri.conf.json")) as Map<*, *>)["version"] as String
val (versionMajor, versionMinor, versionPatch) = appVersion.split(".").map { it.toInt() }

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

val keystoreProperties = Properties().apply {
    val propFile = rootProject.file("keystore.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

fun signingValue(key: String, env: String): String? =
    keystoreProperties.getProperty(key)?.takeIf { it.isNotBlank() }
        ?: System.getenv(env)?.takeIf { it.isNotBlank() }

val releaseSigningReady = signingValue("storeFile", "ANDROID_KEYSTORE_FILE") != null

fun abiDigit(abi: String?): Int = when (abi) {
    "armeabi-v7a" -> 1
    "arm64-v8a" -> 2
    "x86_64" -> 3
    else -> 0
}

fun releaseVersionCode(digit: Int): Int =
    (versionMajor * 10000 + versionMinor * 100 + versionPatch) * 10 + digit

android {
    compileSdk = 35
    ndkVersion = "27.0.12077973"
    namespace = "com.hushio.app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        manifestPlaceholders["googleRedirectScheme"] = googleRedirectScheme()
        applicationId = "com.hushio.app"
        minSdk = 26
        targetSdk = 35
        versionCode = releaseVersionCode(0)
        versionName = appVersion
    }
    signingConfigs {
        create("release") {
            if (releaseSigningReady) {
                storeFile = file(signingValue("storeFile", "ANDROID_KEYSTORE_FILE")!!)
                storePassword = signingValue("storePassword", "ANDROID_KEYSTORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "ANDROID_KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "ANDROID_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (releaseSigningReady) {
                signingConfig = signingConfigs.getByName("release")
            }
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        buildConfig = true
    }
}

androidComponents {
    onVariants { variant ->
        variant.outputs.forEach { output ->
            val abi = output.filters.firstOrNull { it.filterType == FilterConfiguration.FilterType.ABI }
            output.versionCode.set(releaseVersionCode(abiDigit(abi?.identifier)))
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_17
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))

fun googleRedirectScheme(): String {
    val clientId = System.getenv("HUSHIO_GOOGLE_CLIENT_ID").orEmpty()
    val prefix = clientId.removeSuffix(".apps.googleusercontent.com")
    return if (prefix.isNotEmpty() && prefix != clientId) "com.googleusercontent.apps.$prefix" else "hushio.unconfigured"
}
