import java.util.Properties
import javax.inject.Inject

plugins {
    id("com.android.application")
}

/**
 * Copies the built mobile web app (apps/mobile/dist) into the APK assets under `web/`, so the app can
 * speak without a computer. The copy is generated under build/ and never committed.
 *
 * Build the web app first: `npm run build -w @speed-deck/mobile` from the repository root
 * (`npm run android:debug -w @speed-deck/android` does both).
 */
abstract class BundleWebApp : DefaultTask() {
    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val webDist: ConfigurableFileCollection

    @get:Internal
    abstract val webDistDir: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDirectory: DirectoryProperty

    @get:Inject
    abstract val files: FileSystemOperations

    @TaskAction
    fun copy() {
        val dist = webDistDir.get().asFile
        if (!dist.resolve("index.html").isFile) {
            throw GradleException(
                "The mobile web app is not built: ${dist.path} has no index.html. " +
                    "Run `npm run build -w @speed-deck/mobile` from the repository root first.",
            )
        }
        files.sync {
            from(dist)
            into(outputDirectory.dir("web"))
        }
    }
}

val mobileDist = rootProject.layout.projectDirectory.dir("../mobile/dist")
val bundleWebApp = tasks.register<BundleWebApp>("bundleWebApp") {
    webDistDir.set(mobileDist)
    webDist.from(mobileDist)
}

/**
 * The upload key that signs the release bundle for Google Play. Its location and passwords come from
 * `apps/android/keystore.properties` (git-ignored; keys `storeFile`, `storePassword`, `keyAlias`,
 * `keyPassword`) or, for each value missing there, from the environment variables below. With none of
 * them set, release builds are left unsigned; with only some, the build stops and names what is missing.
 */
val keystoreProperties = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.isFile) file.inputStream().use(::load)
}
val uploadSigning: Map<String, String?> = mapOf(
    "storeFile" to "SPEED_DECK_UPLOAD_STORE_FILE",
    "storePassword" to "SPEED_DECK_UPLOAD_STORE_PASSWORD",
    "keyAlias" to "SPEED_DECK_UPLOAD_KEY_ALIAS",
    "keyPassword" to "SPEED_DECK_UPLOAD_KEY_PASSWORD",
).mapValues { (property, variable) ->
    (keystoreProperties.getProperty(property) ?: providers.environmentVariable(variable).orNull)?.trim()?.takeIf(String::isNotEmpty)
}
val missingSigningValues = uploadSigning.filterValues { it == null }.keys
if (missingSigningValues.isNotEmpty() && missingSigningValues.size < uploadSigning.size) {
    throw GradleException(
        "The upload key is only partly configured: $missingSigningValues missing. " +
            "Set every value in apps/android/keystore.properties (see README.md, \"Publishing to Google Play\"), or none.",
    )
}
val hasUploadKey = missingSigningValues.isEmpty()

android {
    namespace = "com.alejoxcode.speeddeck"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.alejoxcode.speeddeck"
        minSdk = 26
        targetSdk = 36
        // Bump both in gradle.properties: Google Play refuses a versionCode it has already seen.
        versionCode = providers.gradleProperty("speedDeck.versionCode").get().toInt()
        versionName = providers.gradleProperty("speedDeck.versionName").get()
    }

    signingConfigs {
        if (hasUploadKey) {
            create("release") {
                storeFile = rootProject.file(uploadSigning.getValue("storeFile")!!)
                storePassword = uploadSigning.getValue("storePassword")
                keyAlias = uploadSigning.getValue("keyAlias")
                keyPassword = uploadSigning.getValue("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Not minified: R8 has not been checked on a phone against the JavaScript bridges
            // (@JavascriptInterface methods are called by name from the web app).
            isMinifyEnabled = false
            // Without an upload key the bundle is built unsigned (Google Play will not accept it).
            signingConfig = if (hasUploadKey) signingConfigs.getByName("release") else null
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(bundleWebApp, BundleWebApp::outputDirectory)
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.webkit:webkit:1.18.0")
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    // Google Play Billing (one-time "remove ads" product), with the Kotlin extensions.
    implementation("com.android.billingclient:billing-ktx:9.1.0")

    testImplementation("junit:junit:4.13.2")
}
