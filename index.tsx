import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// --- Constantes (Constants) ---
const SERVICE_TYPES = ["Roçagem", "Pintura de Guia", "Capinagem", "Varreção", "Roçagem em Escolas"];

// --- Tipos (Types) ---
type Role = 'ADMIN' | 'OPERATOR' | 'FISCAL';
type View =
  | 'LOGIN'
  | 'ADMIN_DASHBOARD'
  | 'ADMIN_MANAGE_LOCATIONS'
  | 'ADMIN_MANAGE_USERS'
  | 'ADMIN_MANAGE_GOALS'
  | 'FISCAL_DASHBOARD'
  | 'REPORTS'
  | 'HISTORY'
  | 'DETAIL'
  | 'OPERATOR_CITY_SELECT'
  | 'OPERATOR_SERVICE_SELECT'
  | 'OPERATOR_LOCATION_SELECT'
  | 'PHOTO_STEP'
  | 'CONFIRM_STEP';

interface User {
  id: string;
  username: string;
  password?: string;
  role: Role;
  assignedCity?: string;
}

interface GeolocationCoords {
  latitude: number;
  longitude: number;
}

interface LocationRecord {
  id: string;
  city: string;
  name: string;
  area: number; // metragem
  coords?: GeolocationCoords;
}

interface ServiceRecord {
  id: string;
  operatorId: string;
  operatorName: string;
  serviceType: string;
  locationId?: string;
  locationName: string;
  locationCity?: string;
  locationArea?: number;
  gpsUsed: boolean;
  startTime: string;
  endTime: string;
  beforePhotos: string[];
  afterPhotos: string[];
}

interface Goal {
    id: string;
    city: string;
    month: string; // YYYY-MM
    targetArea: number;
}

// --- Dados Padrão (Default Data) ---
const DEFAULT_USERS: User[] = [
    { id: 'user-admin', username: 'admin', password: 'admin123', role: 'ADMIN' },
    { id: 'user-op1', username: 'operador', password: 'operador123', role: 'OPERATOR', assignedCity: 'Contrato Exemplo A' },
    { id: 'user-fiscal1', username: 'fiscal', password: 'fiscal123', role: 'FISCAL', assignedCity: 'Contrato Exemplo B' },
];

// --- Funções Auxiliares (Helper Functions) ---
const formatDateTime = (isoString: string) => new Date(isoString).toLocaleString('pt-BR');
const calculateDistance = (p1: GeolocationCoords, p2: GeolocationCoords) => {
    if (!p1 || !p2) return Infinity;
    const R = 6371e3; // metres
    const φ1 = p1.latitude * Math.PI / 180;
    const φ2 = p2.latitude * Math.PI / 180;
    const Δφ = (p2.latitude - p1.latitude) * Math.PI / 180;
    const Δλ = (p2.longitude - p1.longitude) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // in metres
};

// --- Hooks ---
const useLocalStorage = <T,>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] => {
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) { return initialValue; }
    });
    const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
        try {
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (error) { console.error(error); }
    };
    return [storedValue, setValue];
};

// --- Componentes ---

const Header: React.FC<{ view: View; currentUser: User | null; onBack?: () => void; onLogout: () => void; }> = ({ view, currentUser, onBack, onLogout }) => {
    const isAdmin = currentUser?.role === 'ADMIN';
    const showBackButton = onBack && view !== 'LOGIN' && view !== 'ADMIN_DASHBOARD' && view !== 'FISCAL_DASHBOARD';
    const showLogoutButton = currentUser;

    const getTitle = () => {
        if (!currentUser) return 'CRB SERVIÇOS';
        
        if (isAdmin) {
            switch(view) {
                case 'ADMIN_DASHBOARD': return 'Painel do Administrador';
                case 'ADMIN_MANAGE_LOCATIONS': return 'Gerenciar Locais';
                case 'ADMIN_MANAGE_USERS': return 'Gerenciar Funcionários';
                case 'ADMIN_MANAGE_GOALS': return 'Metas de Desempenho';
                case 'REPORTS': return 'Gerador de Relatórios';
                case 'HISTORY': return 'Histórico Geral';
                case 'DETAIL': return 'Detalhes do Serviço';
                default: return 'Modo Administrador';
            }
        }

        if (currentUser.role === 'FISCAL') {
             switch(view) {
                case 'FISCAL_DASHBOARD': return 'Painel de Fiscalização';
                case 'REPORTS': return 'Relatórios';
                case 'HISTORY': return 'Histórico de Serviços';
                case 'DETAIL': return 'Detalhes do Serviço';
                default: return 'Modo Fiscalização';
            }
        }

        switch(view) {
            case 'OPERATOR_CITY_SELECT': return 'Selecione a Cidade/Contrato';
            case 'OPERATOR_SERVICE_SELECT': return `Serviços em ${currentUser.assignedCity || ''}`;
            case 'OPERATOR_LOCATION_SELECT': return 'Registro do Serviço';
            case 'HISTORY': return 'Meu Histórico';
            case 'DETAIL': return 'Detalhes do Serviço';
            default: return 'Registro de Serviço';
        }
    }
    
    return (
        <header className={isAdmin ? 'admin-header' : ''}>
            {showBackButton && <button className="button button-sm button-secondary header-back-button" onClick={onBack}>&lt; Voltar</button>}
            <h1>{getTitle()}</h1>
            {showLogoutButton && <button className="button button-sm button-danger header-logout-button" onClick={onLogout}>Sair</button>}
        </header>
    );
};

const Loader: React.FC<{ text?: string }> = ({ text = "Carregando..." }) => (
  <div className="loader-container"><div className="spinner"></div><p>{text}</p></div>
);

const CameraView: React.FC<{ onCapture: (dataUrl: string) => void; onCancel: () => void; onFinish: () => void; photoCount: number }> = 
({ onCapture, onCancel, onFinish, photoCount }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);

    useEffect(() => {
        let isMounted = true;
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(mediaStream => {
                if (isMounted) {
                    setStream(mediaStream);
                    if (videoRef.current) videoRef.current.srcObject = mediaStream;
                }
            }).catch(err => {
                console.error("Camera access failed:", err);
                let message = "Acesso à câmera negado.";
                if (err instanceof DOMException) {
                    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
                        message = "Nenhuma câmera encontrada. Conecte uma câmera e tente novamente.";
                    } else if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
                        message = "A permissão para acessar a câmera foi negada. Habilite nas configurações do seu navegador.";
                    }
                }
                alert(message);
                onCancel();
            });
        return () => {
            isMounted = false;
            stream?.getTracks().forEach(track => track.stop());
        };
    }, [onCancel]);

    const handleTakePhoto = () => {
        const canvas = document.createElement('canvas');
        if (videoRef.current) {
            const video = videoRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d')?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            onCapture(canvas.toDataURL('image/jpeg'));
        }
    };
    
    return (
        <div className="camera-view">
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="camera-controls">
                <button className="button button-secondary" onClick={onCancel}>Cancelar</button>
                <button id="shutter-button" onClick={handleTakePhoto} aria-label="Tirar Foto"></button>
                <button className="button button-success" onClick={onFinish} disabled={photoCount === 0}>Encerrar</button>
            </div>
        </div>
    );
};

const Login: React.FC<{ onLogin: (user: User) => void; users: User[] }> = ({ onLogin, users }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = () => {
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (user && user.password === password) {
            onLogin(user);
        } else {
            setError('Usuário ou senha inválidos.');
        }
    };

    return (
        <div className="login-container card">
            <h2>Login de Acesso</h2>
            <p>Entre com suas credenciais.</p>
            {error && <p className="text-danger">{error}</p>}
            <input type="text" placeholder="Usuário" value={username} onChange={e => setUsername(e.target.value)} />
            <input type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} />
            <button className="button" onClick={handleLogin}>Entrar</button>
        </div>
    );
};

const AdminDashboard: React.FC<{ 
    onNavigate: (view: View) => void;
    onBackup: () => void;
    onRestore: () => void;
}> = ({ onNavigate, onBackup, onRestore }) => (
    <div className="admin-dashboard">
        <button className="button admin-button" onClick={() => onNavigate('ADMIN_MANAGE_LOCATIONS')}>Gerenciar Locais</button>
        <button className="button admin-button" onClick={() => onNavigate('ADMIN_MANAGE_USERS')}>Gerenciar Funcionários</button>
        <button className="button admin-button" onClick={() => onNavigate('REPORTS')}>Gerador de Relatórios</button>
        <button className="button admin-button" onClick={() => onNavigate('HISTORY')}>Histórico Geral</button>
        <button className="button admin-button" onClick={() => onNavigate('ADMIN_MANAGE_GOALS')}>🎯 Metas de Desempenho</button>
        <button className="button admin-button" onClick={onBackup}>💾 Fazer Backup Geral</button>
        <button className="button admin-button" onClick={onRestore}>🔄 Restaurar Backup</button>
    </div>
);

const FiscalDashboard: React.FC<{ onNavigate: (view: View) => void }> = ({ onNavigate }) => (
    <div className="admin-dashboard">
        <button className="button" onClick={() => onNavigate('REPORTS')}>📊 Gerar Relatórios</button>
        <button className="button" onClick={() => onNavigate('HISTORY')}>📖 Histórico de Serviços</button>
    </div>
);

const OperatorCitySelect: React.FC<{ locations: LocationRecord[]; onSelectCity: (city: string) => void }> = ({ locations, onSelectCity }) => {
    const cities = [...new Set(locations.map(l => l.city))].sort();
    return (
        <div className="card">
            <h2>Selecione a Cidade/Contrato</h2>
            <div className="city-selection-list">
                {cities.length > 0 ? cities.map(city => (
                    <button key={city} className="button" onClick={() => onSelectCity(city)}>{city}</button>
                )) : <p>Nenhuma cidade cadastrada. Contate o administrador.</p>}
            </div>
        </div>
    );
};

const OperatorServiceSelect: React.FC<{ onSelectService: (service: string) => void }> = ({ onSelectService }) => {
    return (
        <div className="card">
            <h2>Escolha o Serviço</h2>
            <div className="service-selection-list">
                {SERVICE_TYPES.map(service => (
                    <button key={service} className="button" onClick={() => onSelectService(service)}>{service}</button>
                ))}
            </div>
        </div>
    );
};

const OperatorLocationSelect: React.FC<{ locations: LocationRecord[]; city: string; onLocationSet: (loc: Partial<ServiceRecord>) => void; }> = ({ locations, city, onLocationSet }) => {
    const [manualLocationName, setManualLocationName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [gpsLocation, setGpsLocation] = useState<GeolocationCoords | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [nearbyLocation, setNearbyLocation] = useState<LocationRecord | null>(null);

    const cityLocations = locations.filter(l => l.city === city);

    useEffect(() => {
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const currentCoords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                setGpsLocation(currentCoords);
                setError(null);
                const closest = cityLocations
                    .filter(l => l.coords)
                    .map(l => ({ ...l, distance: calculateDistance(currentCoords, l.coords!) }))
                    .filter(l => l.distance < 100) // 100m radius
                    .sort((a, b) => a.distance - b.distance)[0];
                setNearbyLocation(closest || null);
            },
            (err) => setError('Não foi possível obter a localização GPS.'),
            { enableHighAccuracy: true }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, [cityLocations]);

    const handleConfirmNearby = () => {
        if(nearbyLocation) {
            onLocationSet({
                locationId: nearbyLocation.id,
                locationName: nearbyLocation.name,
                locationCity: nearbyLocation.city,
                locationArea: nearbyLocation.area,
                gpsUsed: true,
            });
        }
    };

    const handleConfirmNewManual = () => {
        if (manualLocationName.trim()) {
            onLocationSet({
                locationName: manualLocationName.trim(),
                locationCity: city,
                gpsUsed: false,
            });
        } else {
            alert('Por favor, digite o nome do novo local.');
        }
    };

    const handleSelectFromList = (loc: LocationRecord) => {
        onLocationSet({
            locationId: loc.id,
            locationName: loc.name,
            locationCity: loc.city,
            locationArea: loc.area,
            gpsUsed: false,
        });
    };
    
    const filteredLocations = cityLocations.filter(loc =>
        loc.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="card">
            <h2>Selecione o Local em "{city}"</h2>
            {error && <p className="text-danger">{error}</p>}

            {!gpsLocation && !error && <Loader text="Obtendo sinal de GPS..." />}
            {gpsLocation && !nearbyLocation && <Loader text="Procurando locais próximos..." />}

            {nearbyLocation && (
                <div className="card-inset">
                    <h4>Local Próximo Encontrado via GPS</h4>
                    <p><strong>{nearbyLocation.name}</strong></p>
                    <p>Você está neste local?</p>
                    <button className="button" onClick={handleConfirmNearby}>Sim, Confirmar e Continuar</button>
                </div>
            )}
            
             <div className="card-inset">
                <h4>Ou, busque na lista</h4>
                <input 
                    type="search" 
                    placeholder="Digite para buscar um local..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)} 
                    style={{marginBottom: '1rem'}}
                />
                <div className="location-selection-list">
                    {filteredLocations.length > 0 ? filteredLocations.map(loc => (
                        <button key={loc.id} className="button button-secondary" onClick={() => handleSelectFromList(loc)}>{loc.name}</button>
                    )) : <p>Nenhum local encontrado com esse nome.</p>}
                </div>
             </div>

             <div className="card-inset">
                <h4>Ou, crie um novo local</h4>
                <input type="text" placeholder="Digite o nome do NOVO local" value={manualLocationName} onChange={e => setManualLocationName(e.target.value)} />
                <button className="button" onClick={handleConfirmNewManual} disabled={!manualLocationName.trim()}>Confirmar Novo Local</button>
             </div>
        </div>
    );
};

const PhotoStep: React.FC<{ phase: 'BEFORE' | 'AFTER'; onComplete: (photos: string[]) => void; onCancel: () => void }> = ({ phase, onComplete, onCancel }) => {
    const [photos, setPhotos] = useState<string[]>([]);
    const [isTakingPhoto, setIsTakingPhoto] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const title = phase === 'BEFORE' ? 'Fotos Iniciais ("Antes")' : 'Fotos Finais ("Depois")';
    const instruction = `Capture fotos do local ${phase === 'BEFORE' ? 'antes' : 'após'} o serviço. Tire quantas quiser. Pressione 'Encerrar' quando terminar.`;

    const handleCapture = (dataUrl: string) => {
        setPhotos(p => [...p, dataUrl]);
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target?.result as string;
                if (dataUrl) {
                    setPhotos(p => [...p, dataUrl]);
                }
            };
            reader.readAsDataURL(file);
        }
        if (event.target) {
            event.target.value = '';
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    if(isTakingPhoto) {
        return <CameraView onCapture={handleCapture} onCancel={() => setIsTakingPhoto(false)} onFinish={() => setIsTakingPhoto(false)} photoCount={photos.length} />
    }

    return (
        <div className="card">
            <h2>{title}</h2>
            <p>{instruction}</p>
            <div className="photo-section">
                <h3>Fotos Capturadas ({photos.length})</h3>
                <div className="photo-gallery">
                    {photos.map((p, i) => <img key={i} src={p} alt={`Foto ${i+1}`} className="image-preview" />)}
                </div>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    accept="image/*"
                />
                <div className="photo-actions">
                    <button className="button" onClick={() => setIsTakingPhoto(true)}>📷 {photos.length > 0 ? 'Tirar Outra Foto' : 'Iniciar Captura'}</button>
                    <button className="button button-secondary" onClick={handleUploadClick}>🖼️ Adicionar Foto do Dispositivo</button>
                </div>
            </div>
            <div style={{display: 'flex', gap: '1rem', marginTop: '1rem'}}>
                <button className="button button-danger" onClick={onCancel}>Cancelar</button>
                <button className="button button-success" onClick={() => onComplete(photos)} disabled={photos.length === 0}>✅ Encerrar Captação</button>
            </div>
        </div>
    );
};

const ConfirmStep: React.FC<{ recordData: Partial<ServiceRecord>; onSave: () => void; onCancel: () => void }> = ({ recordData, onSave, onCancel }) => (
    <div className="card">
        <h2>Confirmação e Salvamento</h2>
        <div className="detail-section" style={{textAlign: 'left'}}>
            <p><strong>Cidade:</strong> {recordData.locationCity}</p>
            <p><strong>Serviço:</strong> {recordData.serviceType}</p>
            <p><strong>Local:</strong> {recordData.locationName} {recordData.gpsUsed && '📍(GPS)'}</p>
            <p><strong>Data/Hora:</strong> {formatDateTime(new Date().toISOString())}</p>
            {recordData.locationArea ? <p><strong>Metragem:</strong> {recordData.locationArea} m²</p> : <p><strong>Metragem:</strong> Não informada (novo local)</p>}
            
            <h3>Fotos "Antes" ({recordData.beforePhotos?.length})</h3>
            <div className="photo-gallery">{recordData.beforePhotos?.map((p,i) => <img key={i} src={p} alt={`Antes ${i+1}`} className="image-preview" />)}</div>
            
            <h3>Fotos "Depois" ({recordData.afterPhotos?.length})</h3>
            <div className="photo-gallery">{recordData.afterPhotos?.map((p,i) => <img key={i} src={p} alt={`Depois ${i+1}`} className="image-preview" />)}</div>
        </div>
        <div style={{display: 'flex', gap: '1rem'}}>
            <button className="button button-danger" onClick={onCancel}>Cancelar</button>
            <button className="button button-success" onClick={onSave}>✅ Salvar Registro</button>
        </div>
    </div>
);

const HistoryView: React.FC<{ records: ServiceRecord[]; onSelect: (record: ServiceRecord) => void; isAdmin: boolean }> = ({ records, onSelect, isAdmin }) => (
    <div>
        {records.length === 0 ? <p style={{textAlign: 'center'}}>Nenhum serviço registrado ainda.</p>
        : (
            <ul className="history-list">
                {records.map(record => (
                    <li key={record.id} className="list-item" onClick={() => onSelect(record)}>
                        <p><strong>Local:</strong> {record.locationName}, {record.locationCity} {record.gpsUsed && <span className="gps-indicator">📍</span>}</p>
                        <p><strong>Serviço:</strong> {record.serviceType}</p>
                        <p><strong>Data:</strong> {formatDateTime(record.startTime)}</p>
                        {isAdmin && <p><strong>Operador:</strong> {record.operatorName}</p>}
                        <div className="history-item-photos">
                           {record.beforePhotos.slice(0,2).map((p,i) => <img key={`b-${i}`} src={p} />)}
                           {record.afterPhotos.slice(0,2).map((p,i) => <img key={`a-${i}`} src={p} />)}
                        </div>
                    </li>
                ))}
            </ul>
        )}
    </div>
);

const DetailView: React.FC<{ record: ServiceRecord }> = ({ record }) => (
     <div className="detail-view">
        <div className="detail-section card">
            <h3>Resumo</h3>
            <p><strong>Cidade:</strong> {record.locationCity}</p>
            <p><strong>Local:</strong> {record.locationName} {record.gpsUsed && <span className='gps-indicator'>📍(GPS)</span>}</p>
            <p><strong>Serviço:</strong> {record.serviceType}</p>
            {record.locationArea ? <p><strong>Metragem:</strong> {record.locationArea} m²</p> : <p><strong>Metragem:</strong> Não informada</p>}
            <p><strong>Operador:</strong> {record.operatorName}</p>
            <p><strong>Início:</strong> {formatDateTime(record.startTime)}</p>
            <p><strong>Fim:</strong> {formatDateTime(record.endTime)}</p>
        </div>
        <div className="detail-section card">
            <h3>Fotos "Antes" ({record.beforePhotos.length})</h3>
            <div className="photo-gallery">{record.beforePhotos.map((p,i) => <img key={i} src={p} alt={`Antes ${i+1}`} />)}</div>
        </div>
        <div className="detail-section card">
            <h3>Fotos "Depois" ({record.afterPhotos.length})</h3>
            <div className="photo-gallery">{record.afterPhotos.map((p,i) => <img key={i} src={p} alt={`Depois ${i+1}`} />)}</div>
        </div>
    </div>
);

const ReportsView: React.FC<{ records: ServiceRecord[]; locations: LocationRecord[]; forcedCity?: string; }> = ({ records, locations, forcedCity }) => {
    const [reportType, setReportType] = useState<'excel' | 'photos' | null>(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedServices, setSelectedServices] = useState<string[]>([]);
    const [selectedCity, setSelectedCity] = useState(forcedCity || '');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const printableRef = useRef<HTMLDivElement>(null);
    
    const cities = forcedCity ? [forcedCity] : ['', ...new Set(locations.map(l => l.city))].sort();

    const handleServiceFilterChange = (service: string, isChecked: boolean) => {
        setSelectedServices(prev => 
            isChecked ? [...prev, service] : prev.filter(s => s !== service)
        );
    };

    const filteredRecords = records.filter(r => {
        const recordDate = new Date(r.startTime);
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (start && recordDate < start) return false;
        if (end) { end.setHours(23, 59, 59, 999); if (recordDate > end) return false; }
        if (selectedServices.length > 0 && !selectedServices.includes(r.serviceType)) return false;
        if (selectedCity && r.locationCity !== selectedCity) return false;
        return true;
    }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if(e.target.checked) setSelectedIds(filteredRecords.map(r => r.id));
        else setSelectedIds([]);
    }

    const handleSelectOne = (id: string, isChecked: boolean) => {
        if(isChecked) setSelectedIds(ids => [...ids, id]);
        else setSelectedIds(ids => ids.filter(i => i !== id));
    }

    const selectedRecords = records.filter(r => selectedIds.includes(r.id));
    const totalArea = selectedRecords.reduce((sum, r) => sum + (r.locationArea || 0), 0);

    const handleExportExcel = async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Relatório de Serviços');
        sheet.columns = [
            { header: 'Cidade', key: 'city', width: 25 },
            { header: 'Data', key: 'date', width: 20 },
            { header: 'Serviço', key: 'service', width: 20 },
            { header: 'Local', key: 'location', width: 30 },
            { header: 'Metragem (m²)', key: 'area', width: 15 },
        ];
        selectedRecords.forEach(r => {
            sheet.addRow({
                city: r.locationCity,
                date: formatDateTime(r.startTime),
                service: r.serviceType,
                location: r.locationName,
                area: r.locationArea || 'N/A'
            });
        });
        sheet.addRow({});
        const totalRow = sheet.addRow({ location: 'Total', area: totalArea });
        totalRow.font = { bold: true };

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `relatorio_crb_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();
    };

    const handleExportPdf = async () => {
        if (!printableRef.current) return;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pages = printableRef.current.querySelectorAll('.printable-report-page');

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i] as HTMLElement;
            const canvas = await html2canvas(page, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const imgProps= doc.getImageProperties(imgData);
            const pdfWidth = doc.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            
            if (i > 0) doc.addPage();
            doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        }
        doc.save(`relatorio_fotos_crb_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    if (!reportType) {
        return (
            <div className="card">
                <h2>Selecione o Tipo de Relatório</h2>
                <div className="button-group" style={{flexDirection: 'column', gap: '1rem'}}>
                    <button className="button" onClick={() => setReportType('excel')}>📊 Relatório Planilha de Excel</button>
                    <button className="button button-secondary" onClick={() => setReportType('photos')}>🖼️ Relatório de Fotografias (PDF)</button>
                </div>
            </div>
        )
    }

    return (
        <div>
            <div className="card report-filters">
                <div className="form-group">
                    <label htmlFor="start-date">Data de Início</label>
                    <input id="start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="form-group">
                    <label htmlFor="end-date">Data Final</label>
                    <input id="end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                 <div className="form-group">
                    <label htmlFor="city-filter">Cidade / Contrato</label>
                    <select id="city-filter" value={selectedCity} onChange={e => setSelectedCity(e.target.value)} disabled={!!forcedCity}>
                        {cities.map(city => (
                            <option key={city} value={city}>{city || 'Todas as Cidades'}</option>
                        ))}
                    </select>
                </div>
                <fieldset className="form-group-full">
                    <legend>Filtrar por Serviço</legend>
                    <div className="checkbox-group">
                        {SERVICE_TYPES.map(service => (
                            <div key={service} className="checkbox-item">
                                <input type="checkbox" id={`service-${service}`} checked={selectedServices.includes(service)} onChange={e => handleServiceFilterChange(service, e.target.checked)} />
                                <label htmlFor={`service-${service}`}>{service}</label>
                            </div>
                        ))}
                    </div>
                </fieldset>
            </div>

            <div className="report-list">
                {filteredRecords.length > 0 && (
                     <div className="report-item">
                        <input type="checkbox" onChange={handleSelectAll} checked={selectedIds.length === filteredRecords.length && filteredRecords.length > 0} />
                        <div className="report-item-info"><strong>Selecionar Todos</strong></div>
                    </div>
                )}
                {filteredRecords.map(r => (
                    <div key={r.id} className="report-item">
                        <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={e => handleSelectOne(r.id, e.target.checked)} />
                        <div className="report-item-info">
                            <p><strong>{r.locationName}, {r.locationCity}</strong></p>
                            <p>{r.serviceType} - {formatDateTime(r.startTime)} - {r.locationArea || 0} m²</p>
                        </div>
                    </div>
                ))}
            </div>

            {selectedIds.length > 0 && (
                <div className="report-summary card">
                    <h3>Resumo da Exportação</h3>
                    <p>{selectedRecords.length} registro(s) selecionado(s).</p>
                    <p>Total de metragem: <strong>{totalArea.toLocaleString('pt-BR')} m²</strong></p>
                    <div className="button-group">
                        {reportType === 'excel' && <button className="button" onClick={handleExportExcel}>📊 Exportar Excel</button>}
                        {reportType === 'photos' && <button className="button button-secondary" onClick={handleExportPdf}>🖼️ Exportar PDF c/ Fotos</button>}
                    </div>
                </div>
            )}
            
            <div className="printable-report" ref={printableRef}>
                {selectedRecords.map(r => (
                    <div key={r.id} className="printable-report-page">
                        <div className="printable-page-header">
                            <h2>Relatório de Serviço - CRB Serviços</h2>
                            <p><strong>Cidade:</strong> {r.locationCity}</p>
                            <p><strong>Local:</strong> {r.locationName}</p>
                            <p><strong>Serviço:</strong> {r.serviceType}</p>
                            <p><strong>Data:</strong> {formatDateTime(r.startTime)}</p>
                            <p><strong>Metragem:</strong> {r.locationArea ? `${r.locationArea.toLocaleString('pt-BR')} m²` : 'Não informada'}</p>
                        </div>
                        <h3>Fotos "Antes"</h3>
                        <div className="printable-report-gallery">
                            {r.beforePhotos.map((p, i) => (
                                <div key={`before-${i}`} className="photo-item-container">
                                    <img src={p} alt={`Foto Antes ${i + 1}`} />
                                    <p className="caption">Antes {i + 1}</p>
                                </div>
                            ))}
                        </div>
                        <h3>Fotos "Depois"</h3>
                        <div className="printable-report-gallery">
                            {r.afterPhotos.map((p, i) => (
                                <div key={`after-${i}`} className="photo-item-container">
                                    <img src={p} alt={`Foto Depois ${i + 1}`} />
                                    <p className="caption">Depois {i + 1}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ManageLocationsView: React.FC<{ locations: LocationRecord[]; setLocations: React.Dispatch<React.SetStateAction<LocationRecord[]>>; }> = ({ locations, setLocations }) => {
    const [city, setCity] = useState('');
    const [name, setName] = useState('');
    const [area, setArea] = useState('');
    const [coords, setCoords] = useState<Partial<GeolocationCoords> | null>(null);
    const [isFetchingCoords, setIsFetchingCoords] = useState(false);
    const [editingId, setEditingId] = useState<string|null>(null);

    const resetForm = () => {
        setCity('');
        setName('');
        setArea('');
        setCoords(null);
        setEditingId(null);
    };

    const handleGetCoordinates = () => {
        setIsFetchingCoords(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setCoords({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
                setIsFetchingCoords(false);
            },
            (error) => {
                alert(`Erro ao obter GPS: ${error.message}`);
                setIsFetchingCoords(false);
            },
            { enableHighAccuracy: true }
        );
    };
    
    const handleCoordChange = (field: 'latitude' | 'longitude', valueStr: string) => {
        const value = parseFloat(valueStr);
        setCoords(curr => {
            const newCoords = { ...(curr || {}) };
            // @ts-ignore
            newCoords[field] = isNaN(value) ? undefined : value;
            if (newCoords.latitude === undefined && newCoords.longitude === undefined) {
                return null;
            }
            return newCoords;
        });
    };

    const handleSave = () => {
        if (!city || !name || !area || isNaN(parseFloat(area))) {
            alert('Preencha todos os campos corretamente.');
            return;
        }
        const finalCoords = (coords?.latitude && coords?.longitude) ? {latitude: coords.latitude, longitude: coords.longitude} : undefined;

        const newLocation: LocationRecord = {
            id: editingId || new Date().toISOString(),
            city,
            name,
            area: parseFloat(area),
            coords: finalCoords,
        };

        if (editingId) {
            setLocations(locations.map(l => l.id === editingId ? newLocation : l));
        } else {
            setLocations([newLocation, ...locations]);
        }
        resetForm();
    };

    const handleEdit = (loc: LocationRecord) => {
        setEditingId(loc.id);
        setCity(loc.city);
        setName(loc.name);
        setArea(String(loc.area));
        setCoords(loc.coords || null);
    };

    const handleDelete = (id: string) => {
        if(window.confirm('Excluir este local?')) {
            setLocations(locations.filter(l => l.id !== id));
        }
    };

    return (
        <div>
            <div className="form-container card">
                <h3>{editingId ? 'Editando Local' : 'Adicionar Novo Local'}</h3>
                <input type="text" placeholder="Cidade / Contrato" value={city} onChange={e => setCity(e.target.value)} />
                <input type="text" placeholder="Nome do Local" value={name} onChange={e => setName(e.target.value)} />
                <input type="number" placeholder="Metragem (m²)" value={area} onChange={e => setArea(e.target.value)} />
                
                <div className="form-group" style={{marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem'}}>
                     <label>Coordenadas GPS (Opcional)</label>
                     <p style={{fontSize: '0.8rem', color: '#666', margin: '0.25rem 0'}}>Preencha manualmente ou clique no botão para capturar as coordenadas GPS atuais.</p>
                     <div className="coord-inputs">
                        <input type="number" step="any" placeholder="Latitude" value={coords?.latitude ?? ''} onChange={e => handleCoordChange('latitude', e.target.value)} />
                        <input type="number" step="any" placeholder="Longitude" value={coords?.longitude ?? ''} onChange={e => handleCoordChange('longitude', e.target.value)} />
                     </div>
                     <button className="button button-secondary" onClick={handleGetCoordinates} disabled={isFetchingCoords}>
                        {isFetchingCoords ? 'Obtendo GPS...' : '📍 Obter Coordenadas GPS Atuais'}
                    </button>
                </div>

                <button className="button admin-button" onClick={handleSave}>{editingId ? 'Salvar Alterações' : 'Adicionar Local'}</button>
                {editingId && <button className="button button-secondary" onClick={resetForm}>Cancelar Edição</button>}
            </div>
            <ul className="location-list">
                {locations.sort((a,b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name)).map(loc => (
                    <li key={loc.id} className="card list-item">
                        <div className="list-item-header">
                            <h3>{loc.name}</h3>
                            <div>
                                <button className="button button-sm admin-button" onClick={() => handleEdit(loc)}>Editar</button>
                                <button className="button button-sm button-danger" onClick={() => handleDelete(loc.id)}>Excluir</button>
                            </div>
                        </div>
                        <p><strong>Cidade:</strong> {loc.city}</p>
                        <p><strong>Metragem:</strong> {loc.area} m²</p>
                        {loc.coords && <p><strong>GPS:</strong> Sim <span className="gps-indicator">📍</span></p>}
                    </li>
                ))}
            </ul>
        </div>
    );
};

const ManageUsersView: React.FC<{ users: User[]; setUsers: React.Dispatch<React.SetStateAction<User[]>>; locations: LocationRecord[]; }> = ({ users, setUsers, locations }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<Role>('OPERATOR');
    const [assignedCity, setAssignedCity] = useState('');
    const [editingId, setEditingId] = useState<string|null>(null);

    const cities = [...new Set(locations.map(l => l.city))].sort();

    const resetForm = () => {
        setUsername('');
        setPassword('');
        setRole('OPERATOR');
        setAssignedCity('');
        setEditingId(null);
    };

    const handleSave = () => {
        if (!username || !password) {
            alert('Usuário e senha são obrigatórios.');
            return;
        }
        if ((role === 'OPERATOR' || role === 'FISCAL') && !assignedCity) {
            alert('Por favor, selecione uma Cidade/Contrato para este funcionário.');
            return;
        }

        const newUser: User = { 
            id: editingId || new Date().toISOString(),
            username, 
            password, 
            role, 
            assignedCity: (role === 'OPERATOR' || role === 'FISCAL') ? assignedCity : undefined
        };

        if (editingId) {
            setUsers(users.map(u => u.id === editingId ? newUser : u));
        } else {
            setUsers([newUser, ...users]);
        }
        resetForm();
    };

    const handleEdit = (user: User) => {
        setEditingId(user.id);
        setUsername(user.username);
        setPassword(user.password || '');
        setRole(user.role);
        setAssignedCity(user.assignedCity || '');
    };

    const handleDelete = (id: string) => {
        if(window.confirm('Excluir este usuário?')) {
            setUsers(users.filter(u => u.id !== id));
        }
    };
    
    return (
        <div>
            <div className="form-container card">
                <h3>{editingId ? 'Editando Funcionário' : 'Adicionar Novo Funcionário'}</h3>
                <input type="text" placeholder="Nome de usuário" value={username} onChange={e => setUsername(e.target.value)} />
                <input type="text" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} />
                <select value={role} onChange={e => setRole(e.target.value as Role)}>
                    <option value="ADMIN">Administrador</option>
                    <option value="OPERATOR">Operador</option>
                    <option value="FISCAL">Fiscalização</option>
                </select>
                {(role === 'OPERATOR' || role === 'FISCAL') && (
                    <select value={assignedCity} onChange={e => setAssignedCity(e.target.value)}>
                        <option value="">Selecione a Cidade/Contrato</option>
                        {cities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                )}
                <button className="button admin-button" onClick={handleSave}>{editingId ? 'Salvar Alterações' : 'Adicionar'}</button>
                {editingId && <button className="button button-secondary" onClick={resetForm}>Cancelar</button>}
            </div>
            <ul className="location-list">
                 {users.map(user => (
                    <li key={user.id} className="card list-item">
                        <div className="list-item-header">
                            <h3>{user.username}</h3>
                            <div>
                                <button className="button button-sm admin-button" onClick={() => handleEdit(user)}>Editar</button>
                                <button className="button button-sm button-danger" onClick={() => handleDelete(user.id)}>Excluir</button>
                            </div>
                        </div>
                        <p><strong>Função:</strong> {user.role}</p>
                        {user.assignedCity && <p><strong>Cidade/Contrato:</strong> {user.assignedCity}</p>}
                    </li>
                 ))}
            </ul>
        </div>
    );
}

const ManageGoalsView: React.FC<{
    goals: Goal[];
    setGoals: React.Dispatch<React.SetStateAction<Goal[]>>;
    records: ServiceRecord[];
    locations: LocationRecord[];
}> = ({ goals, setGoals, records, locations }) => {
    const [city, setCity] = useState('');
    const [month, setMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
    const [targetArea, setTargetArea] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const cities = [...new Set(locations.map(l => l.city))].sort();

    const resetForm = () => {
        setCity('');
        setMonth(new Date().toISOString().substring(0, 7));
        setTargetArea('');
        setEditingId(null);
    };

    const handleSave = () => {
        if (!city || !month || !targetArea || isNaN(parseFloat(targetArea))) {
            alert('Preencha todos os campos corretamente.');
            return;
        }
        const newGoal: Goal = {
            id: editingId || new Date().toISOString(),
            city,
            month,
            targetArea: parseFloat(targetArea),
        };
        if (editingId) {
            setGoals(goals.map(g => g.id === editingId ? newGoal : g));
        } else {
            setGoals([newGoal, ...goals]);
        }
        resetForm();
    };

    const handleEdit = (goal: Goal) => {
        setEditingId(goal.id);
        setCity(goal.city);
        setMonth(goal.month);
        setTargetArea(String(goal.targetArea));
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Excluir esta meta?')) {
            setGoals(goals.filter(g => g.id !== id));
        }
    };

    return (
        <div>
            <div className="form-container card">
                <h3>{editingId ? 'Editando Meta' : 'Adicionar Nova Meta'}</h3>
                <select value={city} onChange={e => setCity(e.target.value)}>
                    <option value="">Selecione a Cidade/Contrato</option>
                    {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
                <input type="number" placeholder="Meta de Metragem (m²)" value={targetArea} onChange={e => setTargetArea(e.target.value)} />
                <button className="button admin-button" onClick={handleSave}>{editingId ? 'Salvar Alterações' : 'Adicionar Meta'}</button>
                {editingId && <button className="button button-secondary" onClick={resetForm}>Cancelar Edição</button>}
            </div>

            <ul className="goal-list">
                {goals.sort((a,b) => b.month.localeCompare(a.month) || a.city.localeCompare(b.city)).map(goal => {
                    const realizedArea = records
                        .filter(r => r.locationCity === goal.city && r.startTime.startsWith(goal.month))
                        .reduce((sum, r) => sum + (r.locationArea || 0), 0);
                    
                    const percentage = goal.targetArea > 0 ? (realizedArea / goal.targetArea) * 100 : 0;
                    const remainingArea = Math.max(0, goal.targetArea - realizedArea);

                    return (
                        <li key={goal.id} className="card list-item progress-card">
                             <div className="list-item-header">
                                <h3>{goal.city} - {goal.month}</h3>
                                <div>
                                    <button className="button button-sm admin-button" onClick={() => handleEdit(goal)}>Editar</button>
                                    <button className="button button-sm button-danger" onClick={() => handleDelete(goal.id)}>Excluir</button>
                                </div>
                            </div>
                            <div className="progress-info">
                                <span>Realizado: {realizedArea.toLocaleString('pt-BR')} / {goal.targetArea.toLocaleString('pt-BR')} m²</span>
                                <span>{percentage.toFixed(1)}%</span>
                            </div>
                            <div className="progress-bar-container">
                                <div className="progress-bar" style={{ width: `${Math.min(percentage, 100)}%` }}></div>
                            </div>
                             <p className="remaining-info">Faltam: {remainingArea.toLocaleString('pt-BR')} m² para atingir a meta.</p>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};


// --- Componente Principal ---
const App = () => {
  const [view, setView] = useState<View>('LOGIN');
  const [currentUser, setCurrentUser] = useLocalStorage<User | null>('crbCurrentUser', null);
  const [users, setUsers] = useLocalStorage<User[]>('crbUsers', DEFAULT_USERS);
  const [locations, setLocations] = useLocalStorage<LocationRecord[]>('crbLocations', []);
  const [records, setRecords] = useLocalStorage<ServiceRecord[]>('crbServiceRecords', []);
  const [goals, setGoals] = useLocalStorage<Goal[]>('crbGoals', []);
  
  const [currentService, setCurrentService] = useState<Partial<ServiceRecord>>({});
  const [selectedRecord, setSelectedRecord] = useState<ServiceRecord | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [history, setHistory] = useState<View[]>([]);

  const navigate = (newView: View, replace = false) => {
    if (!replace) setHistory(h => [...h, view]);
    setView(newView);
  }

  const handleBack = () => {
    const lastView = history.pop();
    if (lastView) {
        setHistory([...history]);
        setView(lastView);
    } else {
        // Fallback if history is empty
        if (currentUser?.role === 'ADMIN') setView('ADMIN_DASHBOARD');
        else if (currentUser?.role === 'FISCAL') setView('FISCAL_DASHBOARD');
        else if (currentUser?.role === 'OPERATOR') setView(currentUser.assignedCity ? 'OPERATOR_SERVICE_SELECT' : 'OPERATOR_CITY_SELECT');
    }
  }
  
  const redirectUser = (user: User) => {
    if (user.role === 'ADMIN') {
        navigate('ADMIN_DASHBOARD', true);
    } else if (user.role === 'OPERATOR') {
        if (user.assignedCity) {
            setSelectedCity(user.assignedCity);
            navigate('OPERATOR_SERVICE_SELECT', true);
        } else {
            navigate('OPERATOR_CITY_SELECT', true);
        }
    } else if (user.role === 'FISCAL') {
        if (user.assignedCity) {
            setSelectedCity(user.assignedCity);
            navigate('FISCAL_DASHBOARD', true);
        } else {
             alert('Usuário Fiscal sem cidade/contrato atribuído. Contate o administrador.');
             handleLogout();
        }
    }
  };

  useEffect(() => {
    if (currentUser && view === 'LOGIN') {
      redirectUser(currentUser);
    } else if (!currentUser) {
      setView('LOGIN');
    }
  }, [currentUser, view]);


  const resetService = () => {
      setCurrentService({});
      const initialView = currentUser?.assignedCity ? 'OPERATOR_SERVICE_SELECT' : 'OPERATOR_CITY_SELECT';
      navigate(currentUser?.role === 'OPERATOR' ? initialView : 'ADMIN_DASHBOARD', true);
  }

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    // The useEffect will handle the redirection
  };

  const handleLogout = () => {
      setCurrentUser(null);
      setHistory([]);
      setSelectedCity(null);
      setCurrentService({});
      navigate('LOGIN', true);
  }

  const handleBackup = () => {
    try {
        const backupData = {
            users,
            locations,
            records,
            goals,
        };
        const jsonString = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const date = new Date().toISOString().split('T')[0];
        link.download = `backup_crb_servicos_${date}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        alert('Backup gerado com sucesso!');
    } catch (error) {
        console.error("Erro ao gerar backup:", error);
        alert('Ocorreu um erro ao gerar o backup.');
    }
  };

  const handleRestore = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const restoredData = JSON.parse(event.target?.result as string);
                // Basic validation
                if (
                    !restoredData ||
                    !Array.isArray(restoredData.users) ||
                    !Array.isArray(restoredData.locations) ||
                    !Array.isArray(restoredData.records) ||
                    !Array.isArray(restoredData.goals)
                ) {
                    throw new Error('Formato do arquivo de backup inválido.');
                }
                
                const confirmation = window.confirm(
                    'Você tem certeza? A restauração de um backup substituirá TODOS os dados atuais. Esta ação não pode ser desfeita.'
                );

                if (confirmation) {
                    setUsers(restoredData.users);
                    setLocations(restoredData.locations);
                    setRecords(restoredData.records);
                    setGoals(restoredData.goals);
                    alert('Backup restaurado com sucesso! O aplicativo será recarregado para aplicar as alterações.');
                    window.location.reload(); 
                }

            } catch (error) {
                console.error("Erro ao restaurar backup:", error);
                const message = error instanceof Error ? error.message : 'Erro desconhecido.';
                alert(`Erro ao restaurar o backup: ${message}`);
            }
        };
        reader.onerror = () => {
            alert('Erro ao ler o arquivo de backup.');
        };
        reader.readAsText(file);
    };
    input.click();
  };

  const handleCitySelect = (city: string) => {
      setSelectedCity(city);
      navigate('OPERATOR_SERVICE_SELECT');
  }

  const handleServiceSelect = (serviceType: string) => {
    setCurrentService({ serviceType });
    navigate('OPERATOR_LOCATION_SELECT');
  };

  const handleLocationSet = (locData: Partial<ServiceRecord>) => {
      setCurrentService(s => ({...s, ...locData}));
      navigate('PHOTO_STEP');
  };

  const handleBeforePhotos = (photos: string[]) => {
      setCurrentService(s => ({...s, beforePhotos: photos, startTime: new Date().toISOString() }));
  };

  const handleAfterPhotos = (photos: string[]) => {
      setCurrentService(s => ({...s, afterPhotos: photos}));
      navigate('CONFIRM_STEP');
  };

  const handleSave = () => {
    if(!currentUser) return;
    const finalRecord: ServiceRecord = {
        id: new Date().toISOString(),
        endTime: new Date().toISOString(),
        operatorId: currentUser.id,
        operatorName: currentUser.username,
        ...currentService
    } as ServiceRecord;

    setRecords(prev => [finalRecord, ...prev]);

    // Se for um local novo, adiciona na lista de locais para o admin completar
    if(!finalRecord.locationId) {
        const newLocation: LocationRecord = {
            id: new Date().toISOString() + '_new',
            name: finalRecord.locationName,
            city: finalRecord.locationCity || 'A ser definida',
            area: 0
        };
        setLocations(prev => [newLocation, ...prev]);
    }
    alert("Registro salvo com sucesso.");
    resetService();
  };

  const handleSelectRecord = (record: ServiceRecord) => {
    setSelectedRecord(record);
    navigate('DETAIL');
  }

  const renderView = () => {
    if (!currentUser) {
        return <Login onLogin={handleLogin} users={users} />;
    }
    
    const backLogic = history.length > 0 ? handleBack : undefined;

    switch(currentUser.role) {
        case 'ADMIN':
            switch(view) {
                case 'ADMIN_DASHBOARD': return <AdminDashboard onNavigate={navigate} onBackup={handleBackup} onRestore={handleRestore} />;
                case 'ADMIN_MANAGE_LOCATIONS': return <ManageLocationsView locations={locations} setLocations={setLocations} />;
                case 'ADMIN_MANAGE_USERS': return <ManageUsersView users={users} setUsers={setUsers} locations={locations} />;
                case 'ADMIN_MANAGE_GOALS': return <ManageGoalsView goals={goals} setGoals={setGoals} records={records} locations={locations} />;
                case 'REPORTS': return <ReportsView records={records} locations={locations} />;
                case 'HISTORY': return <HistoryView records={records} onSelect={handleSelectRecord} isAdmin={true} />;
                case 'DETAIL': return selectedRecord ? <DetailView record={selectedRecord} /> : <p>Registro não encontrado.</p>;
                default: setView('ADMIN_DASHBOARD'); return null;
            }
        
        case 'FISCAL':
            const fiscalRecords = records.filter(r => r.locationCity === currentUser.assignedCity);
            switch(view) {
                case 'FISCAL_DASHBOARD': return <FiscalDashboard onNavigate={navigate} />;
                case 'REPORTS': return <ReportsView records={fiscalRecords} locations={locations} forcedCity={currentUser.assignedCity} />;
                case 'HISTORY': return <HistoryView records={fiscalRecords} onSelect={handleSelectRecord} isAdmin={true} />;
                case 'DETAIL':
                    const canView = selectedRecord && selectedRecord.locationCity === currentUser.assignedCity;
                    return canView ? <DetailView record={selectedRecord} /> : <p>Registro não encontrado ou acesso não permitido.</p>;
                default: setView('FISCAL_DASHBOARD'); return null;
            }

        case 'OPERATOR':
            switch(view) {
                case 'OPERATOR_CITY_SELECT': return <OperatorCitySelect locations={locations} onSelectCity={handleCitySelect} />;
                case 'OPERATOR_SERVICE_SELECT': return <OperatorServiceSelect onSelectService={handleServiceSelect} />;
                case 'OPERATOR_LOCATION_SELECT': return selectedCity ? <OperatorLocationSelect locations={locations} city={selectedCity} onLocationSet={handleLocationSet} /> : null;
                case 'PHOTO_STEP': 
                    if(!currentService.beforePhotos) return <PhotoStep phase="BEFORE" onComplete={handleBeforePhotos} onCancel={resetService} />;
                    return <PhotoStep phase="AFTER" onComplete={handleAfterPhotos} onCancel={resetService} />;
                case 'CONFIRM_STEP': return <ConfirmStep recordData={currentService} onSave={handleSave} onCancel={resetService} />;
                case 'HISTORY': 
                    const operatorRecords = records.filter(r => r.operatorId === currentUser.id);
                    return <HistoryView records={operatorRecords} onSelect={handleSelectRecord} isAdmin={false} />;
                case 'DETAIL': return selectedRecord ? <DetailView record={selectedRecord} /> : <p>Registro não encontrado.</p>;
                default: setView(currentUser.assignedCity ? 'OPERATOR_SERVICE_SELECT' : 'OPERATOR_CITY_SELECT'); return null;
            }
        
        default:
             handleLogout();
             return null;
    }
  };

  return (
    <div className="app-container">
      <Header view={view} currentUser={currentUser} onBack={view !== 'LOGIN' && view !== 'ADMIN_DASHBOARD' && view !== 'FISCAL_DASHBOARD' ? handleBack : undefined} onLogout={handleLogout} />
      <main>{renderView()}</main>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}