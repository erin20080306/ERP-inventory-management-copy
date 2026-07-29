import XCTest
@testable import ErinERP

final class AppNavigationPolicyTests: XCTestCase {
    func testErinWebHostsStayInsideApp() throws {
        XCTAssertEqual(
            AppNavigationPolicy.destination(for: try XCTUnwrap(URL(string: "https://www.erin-com.com/workspace"))),
            .inApp
        )
        XCTAssertEqual(
            AppNavigationPolicy.destination(for: try XCTUnwrap(URL(string: "https://tenant.erin-com.com/products"))),
            .inApp
        )
    }

    func testUntrustedHostsOpenExternally() throws {
        XCTAssertEqual(
            AppNavigationPolicy.destination(for: try XCTUnwrap(URL(string: "https://example.com"))),
            .external
        )
        XCTAssertEqual(
            AppNavigationPolicy.destination(for: try XCTUnwrap(URL(string: "tel:+886212345678"))),
            .external
        )
    }

    func testMedicalPathsAreUnavailableOnlyInIOSApp() throws {
        for path in [
            "/medical",
            "/medical/demo",
            "/api/medical/bootstrap",
            "/api/medical-site/demo",
            "/print/medical-receipt/receipt-id",
        ] {
            let url = try XCTUnwrap(URL(string: "https://www.erin-com.com\(path)"))
            XCTAssertEqual(AppNavigationPolicy.destination(for: url), .medicalUnavailable)
        }
        XCTAssertEqual(
            AppNavigationPolicy.destination(for: try XCTUnwrap(URL(string: "https://www.erin-com.com/medical-aesthetics/hero.png"))),
            .inApp
        )
    }

    func testWebPricingCannotBypassStoreKit() throws {
        XCTAssertEqual(
            AppNavigationPolicy.destination(for: try XCTUnwrap(URL(string: "https://www.erin-com.com/plans"))),
            .subscription
        )
    }
}
