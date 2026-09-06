import Foundation

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

    func saveSession(token: String, role: String?, user: AuthUser?) {
        self.token = token
        self.role = role
        self.user = user
        KeychainStore.set(token, account: tokenAccount)
        if let role {
            KeychainStore.set(role, account: roleAccount)
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
