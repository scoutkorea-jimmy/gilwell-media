import Foundation

enum AuthServiceError: LocalizedError {
    case keychainWriteFailed

    var errorDescription: String? {
        switch self {
        case .keychainWriteFailed:
            return "로그인 토큰을 Keychain에 저장하지 못했습니다. macOS Keychain 권한을 확인해 주세요."
        }
    }
}

@MainActor
final class AuthService {
    private let tokenAccount = "auth_token"
    private let roleAccount = "auth_role"
    private let userDefaultsKey = "bpmedia.writer.user"

    private(set) var token: String?
    private(set) var role: String?
    private(set) var user: AuthUser?

    @discardableResult
    func restoreSession() -> Bool {
        guard let token = KeychainStore.get(account: tokenAccount), !token.isEmpty else {
            return false
        }
        self.token = token
        self.role = KeychainStore.get(account: roleAccount)
        if let data = UserDefaults.standard.data(forKey: userDefaultsKey) {
            self.user = try? JSONDecoder().decode(AuthUser.self, from: data)
        }
        return true
    }

    func saveSession(token: String, role: String?, user: AuthUser?) throws {
        let ok = KeychainStore.set(token, account: tokenAccount)
        guard ok else { throw AuthServiceError.keychainWriteFailed }
        self.token = token
        self.role = role
        self.user = user
        if let role {
            _ = KeychainStore.set(role, account: roleAccount)
        }
        if let user, let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: userDefaultsKey)
        }
    }

    func logout() {
        token = nil
        role = nil
        user = nil
        KeychainStore.delete(account: tokenAccount)
        KeychainStore.delete(account: roleAccount)
        UserDefaults.standard.removeObject(forKey: userDefaultsKey)
    }
}
