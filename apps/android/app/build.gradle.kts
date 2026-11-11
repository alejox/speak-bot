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

android {
    namespace = "com.alejoxcode.speeddeck"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.alejoxcode.speeddeck"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
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

    testImplementation("junit:junit:4.13.2")
}
