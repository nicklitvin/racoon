import AVFoundation
import Speech

/// Speaking into the pet's bubble: the mic, turned into words as you talk, by macOS's own
/// speech recognition (on the Mac itself where it can). The words go into the box, to send to
/// Alarmie like anything typed. The mic is on only from when you press it until you press it
/// again (or send, or close the bubble), a minute at most.
final class Dictation {
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let recognizer = SFSpeechRecognizer()
    private var timer: Timer?
    /// The longest a recording goes on for.
    private static let maxSeconds = 60.0

    var running: Bool { task != nil }

    /// Asks for the mic and speech recognition if it hasn't yet. Calls back on the main queue
    /// with nil, or what's in the way.
    static func prepare(_ done: @escaping (String?) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                DispatchQueue.main.async { done("My Pet isn’t allowed to use speech recognition. Turn it on in System Settings > Privacy & Security > Speech Recognition.") }
                return
            }
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                DispatchQueue.main.async {
                    done(granted ? nil : "My Pet isn’t allowed to use the microphone. Turn it on in System Settings > Privacy & Security > Microphone.")
                }
            }
        }
    }

    /// Starts listening. `words` gets everything heard so far as it comes in; `ended` once it
    /// stops (with an error to show, if it went wrong).
    func start(words: @escaping (String) -> Void, ended: @escaping (String?) -> Void) {
        stop()
        guard let recognizer, recognizer.isAvailable else {
            ended("Speech recognition isn’t available right now.")
            return
        }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
        self.request = request
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak request] buffer, _ in request?.append(buffer) }
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            self.request = nil
            ended("Couldn’t start the microphone.")
            return
        }
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            DispatchQueue.main.async {
                if let result { words(result.bestTranscription.formattedString) }
                if error != nil || result?.isFinal == true {
                    let failed = error != nil && result == nil
                    self?.finish()
                    ended(failed ? "Couldn’t make out what you said. Try again?" : nil)
                }
            }
        }
        timer = Timer.scheduledTimer(withTimeInterval: Self.maxSeconds, repeats: false) { [weak self] _ in self?.stop() }
    }

    /// Stops listening; what was heard so far comes through as the last `words`.
    func stop() {
        timer?.invalidate()
        timer = nil
        if engine.isRunning {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
    }

    private func finish() {
        stop()
        task = nil
        request = nil
    }

    /// Throws away whatever's being heard.
    func cancel() {
        task?.cancel()
        finish()
    }
}
