
import React, { useState } from 'react';
import { User } from '../types';
import { loginMicrosoft } from '../services/authService';
import { Loader2, X, ShieldCheck } from 'lucide-react';
import { COMPANY_LOGO_URL } from '../constants';

interface LoginModalProps {
    onLoginSuccess: (user: User) => void;
    onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess, onClose }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleMicrosoftLogin = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const user = await loginMicrosoft();
            onLoginSuccess(user);
        } catch (err: any) {
            setError(err.message || "Erro ao conectar com a Microsoft.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col relative">
                <button 
                    onClick={onClose} 
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"
                >
                    <X className="w-6 h-6" />
                </button>

                <div className="bg-gradient-to-br from-gray-900 to-blue-900 p-8 text-center">
                    <img src={COMPANY_LOGO_URL} alt="Petacorp" className="h-12 w-auto object-contain mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white">Login Corporativo</h2>
                    <p className="text-blue-200 text-sm mt-1">Acesso seguro via Single Sign-On (SSO)</p>
                </div>

                <div className="p-8 flex flex-col items-center gap-6">
                    {error && (
                        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2 w-full">
                            <span className="block w-2 h-2 rounded-full bg-red-600 shrink-0" />
                            {error}
                        </div>
                    )}

                    <div className="text-center text-gray-600 text-sm">
                        Para acessar o painel de monitoramento, autentique-se utilizando sua conta Microsoft corporativa.
                    </div>

                    <button
                        onClick={handleMicrosoftLogin}
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-lg shadow-sm bg-white hover:bg-gray-50 text-gray-700 font-medium transition-all disabled:opacity-70 disabled:cursor-not-allowed group"
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                        ) : (
                            <>
                                {/* Microsoft Logo SVG */}
                                <svg className="w-5 h-5" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                                    <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                                    <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                                </svg>
                                <span>Entrar com Microsoft</span>
                            </>
                        )}
                    </button>

                    <div className="mt-4 pt-6 border-t border-gray-100 w-full flex items-center justify-center gap-2 text-xs text-gray-400">
                        <ShieldCheck className="w-3 h-3" />
                        Integração Azure Active Directory
                    </div>
                </div>
            </div>
        </div>
    );
};
