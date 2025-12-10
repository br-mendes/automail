
import { User } from '../types';

/**
 * Simulates Microsoft Authentication (Azure AD / Entra ID).
 * 
 * In a real production environment, you would use the MSAL.js library (@azure/msal-browser).
 * Since we don't have the specific Tenant ID and Client ID configured here,
 * this function simulates the "Popup" flow and returns a successful user profile.
 */
export const loginMicrosoft = async (): Promise<User> => {
    return new Promise((resolve) => {
        // Simulate network latency and popup interaction time
        console.log("[AuthService] Initiating Microsoft Login Flow...");
        
        setTimeout(() => {
            // Mock Data returned from Azure Token
            resolve({
                username: 'usuario@petacorp.com.br',
                displayName: 'Bruno Mendes', // Example name
                isAuthenticated: true
            });
        }, 2000); 
    });
};

export const logout = (): void => {
    // Clear tokens if any
    localStorage.removeItem('petacorp_user');
};
