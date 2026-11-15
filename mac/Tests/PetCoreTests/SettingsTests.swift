import XCTest
@testable import PetCore

final class SettingsTests: XCTestCase {
    func testDefaults() {
        XCTAssertEqual(Settings.normalized(nil), Settings.defaults)
        XCTAssertEqual(Settings.normalized(["raccoonType": "dragon"]), Settings.defaults)
        XCTAssertEqual(Settings.defaults.raccoonType, .raccoonPixel)
        XCTAssertFalse(Settings.defaults.alarmieChat)
    }

    func testOnlyTrueIsTrue() {
        XCTAssertFalse(Settings.normalized(["keyboardReactions": 1]).keyboardReactions)
        XCTAssertFalse(Settings.normalized(["keyboardReactions": "yes"]).keyboardReactions)
        XCTAssertTrue(Settings.normalized(["keyboardReactions": true]).keyboardReactions)
    }

    func testBetaPetsOnlyWithBeta() {
        XCTAssertEqual(Settings.normalized(["raccoonType": "bunny-pixel"]).raccoonType, .raccoonPixel)
        XCTAssertEqual(Settings.normalized(["raccoonType": "bunny-pixel", "beta": true]).raccoonType, .bunnyPixel)
        XCTAssertEqual(Settings.normalized(["raccoonType": "fox-chibi"]).raccoonType, .catPixel)
        XCTAssertEqual(Settings.normalized(["workMode": true]).mode, .work)
    }

    func testRoundTrip() {
        let s = Settings(raccoonType: .otterPixel, keyboardReactions: true, hat: .tophat, outfit: .suit, mode: .work, alarmieChat: true, alarmieEndpoint: "http://localhost:9000/talk")
        XCTAssertEqual(Settings.normalized(s.dictionary), s)
        let data = try! JSONSerialization.data(withJSONObject: s.dictionary)
        XCTAssertEqual(Settings.normalized(try! JSONSerialization.jsonObject(with: data)), s)
    }

    func testEndpoints() {
        XCTAssertEqual(cleanEndpoint(" http://localhost:9000/talk "), "http://localhost:9000/talk")
        XCTAssertNil(cleanEndpoint("localhost:9000"))
        XCTAssertNil(cleanEndpoint("file:///etc/passwd"))
        XCTAssertNil(cleanEndpoint("javascript:alert(1)"))
        XCTAssertNil(cleanEndpoint(42))
        XCTAssertEqual(Settings.normalized(["alarmieEndpoint": "ws://x"]).alarmieEndpoint, ALARMIE_DEFAULT_ENDPOINT)
    }

    func testReadingReplies() {
        XCTAssertEqual(readReply("{\"reply\":\" Morning! \",\"conversationId\":\"abc\"}", "application/json"), Reply(reply: "Morning!", conversationId: "abc"))
        XCTAssertEqual(readReply("{\"message\":\"Hey\",\"conversation_id\":7}", "application/json"), Reply(reply: "Hey", conversationId: "7"))
        XCTAssertEqual(readReply("Rise and shine", "text/plain"), Reply(reply: "Rise and shine", conversationId: nil))
        XCTAssertNil(readReply("   ", nil))
        XCTAssertNil(readReply("{\"ok\":true}", "application/json"))
    }

    func testRequest() {
        let body = liveTalkRequest("hi", nil)
        XCTAssertEqual(body["message"] as? String, "hi")
        XCTAssertTrue(body["conversationId"] is NSNull)
        XCTAssertEqual(body["client"] as? String, "my-pet")
    }
}
