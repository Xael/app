import { jsx, jsxs } from 'react/jsx-runtime';
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// --- Constantes (Constants) ---
const SERVICE_TYPES = ["Roçagem", "Pintura de Guia", "Capinagem", "Varreção", "Roçagem em Escolas"];

// --- Dados Padrão (Default Data) ---
const DEFAULT_USERS = [
    { id: 'user-admin', username: 'admin', password: 'admin123', role: 'ADMIN' },
    { id: 'user-op1', username: 'operador', password: 'operador123', role: 'OPERATOR', assignedCity: 'Contrato Exemplo A' },
    { id: 'user-fiscal1', username: 'fiscal', password: 'fiscal123', role: 'FISCAL', assignedCity: 'Contrato Exemplo B' },
];

// --- Funções Auxiliares (Helper Functions) ---
const formatDateTime = (isoString) => new Date(isoString).toLocaleString('pt-BR');
const calculateDistance = (p1, p2) => {
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
const useLocalStorage = (key, initialValue) => {
    const [storedValue, setStoredValue] = useState(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) { return initialValue; }
    });
    const setValue = (value) => {
        try {
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (error) { console.error(error); }
    };
    return [storedValue, setValue];
};

// --- Componentes ---

const Header = ({ view, currentUser, onBack, onLogout }) => {
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
    
    return jsxs("header", {
        className: isAdmin ? 'admin-header' : '',
        children: [
            showBackButton && jsx("button", { className: "button button-sm button-secondary header-back-button", onClick: onBack, children: "< Voltar" }),
            jsx("h1", { children: getTitle() }),
            showLogoutButton && jsx("button", { className: "button button-sm button-danger header-logout-button", onClick: onLogout, children: "Sair" })
        ]
    });
};

const Loader = ({ text = "Carregando..." }) => (
  jsxs("div", { className: "loader-container", children: [
      jsx("div", { className: "spinner" }),
      jsx("p", { children: text })
  ]})
);

const CameraView = ({ onCapture, onCancel, onFinish, photoCount }) => {
    const videoRef = useRef(null);
    const [stream, setStream] = useState(null);

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
    
    return jsxs("div", { className: "camera-view", children: [
        jsx("video", { ref: videoRef, autoPlay: true, playsInline: true, muted: true }),
        jsxs("div", { className: "camera-controls", children: [
            jsx("button", { className: "button button-secondary", onClick: onCancel, children: "Cancelar" }),
            jsx("button", { id: "shutter-button", onClick: handleTakePhoto, "aria-label": "Tirar Foto" }),
            jsx("button", { className: "button button-success", onClick: onFinish, disabled: photoCount === 0, children: "Encerrar" })
        ]})
    ]});
};

const Login = ({ onLogin, users }) => {
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

    return jsxs("div", { className: "login-container card", children: [
        jsx("h2", { children: "Login de Acesso" }),
        jsx("p", { children: "Entre com suas credenciais." }),
        error && jsx("p", { className: "text-danger", children: error }),
        jsx("input", { type: "text", placeholder: "Usuário", value: username, onChange: e => setUsername(e.target.value) }),
        jsx("input", { type: "password", placeholder: "Senha", value: password, onChange: e => setPassword(e.target.value) }),
        jsx("button", { className: "button", onClick: handleLogin, children: "Entrar" })
    ]});
};

const AdminDashboard = ({ onNavigate, onBackup, onRestore }) => (
    jsxs("div", { className: "admin-dashboard", children: [
        jsx("button", { className: "button admin-button", onClick: () => onNavigate('ADMIN_MANAGE_LOCATIONS'), children: "Gerenciar Locais" }),
        jsx("button", { className: "button admin-button", onClick: () => onNavigate('ADMIN_MANAGE_USERS'), children: "Gerenciar Funcionários" }),
        jsx("button", { className: "button admin-button", onClick: () => onNavigate('REPORTS'), children: "Gerador de Relatórios" }),
        jsx("button", { className: "button admin-button", onClick: () => onNavigate('HISTORY'), children: "Histórico Geral" }),
        jsx("button", { className: "button admin-button", onClick: () => onNavigate('ADMIN_MANAGE_GOALS'), children: "🎯 Metas de Desempenho" }),
        jsx("button", { className: "button admin-button", onClick: onBackup, children: "💾 Fazer Backup Geral" }),
        jsx("button", { className: "button admin-button", onClick: onRestore, children: "🔄 Restaurar Backup" })
    ]})
);

const FiscalDashboard = ({ onNavigate }) => (
    jsxs("div", { className: "admin-dashboard", children: [
        jsx("button", { className: "button", onClick: () => onNavigate('REPORTS'), children: "📊 Gerar Relatórios" }),
        jsx("button", { className: "button", onClick: () => onNavigate('HISTORY'), children: "📖 Histórico de Serviços" })
    ]})
);

const OperatorCitySelect = ({ locations, onSelectCity }) => {
    const cities = [...new Set(locations.map(l => l.city))].sort();
    return jsxs("div", { className: "card", children: [
        jsx("h2", { children: "Selecione a Cidade/Contrato" }),
        jsx("div", { className: "city-selection-list", children:
            cities.length > 0 ? cities.map(city => (
                jsx("button", { className: "button", onClick: () => onSelectCity(city), children: city }, city)
            )) : jsx("p", { children: "Nenhuma cidade cadastrada. Contate o administrador." })
        })
    ]});
};

const OperatorServiceSelect = ({ onSelectService }) => {
    return jsxs("div", { className: "card", children: [
        jsx("h2", { children: "Escolha o Serviço" }),
        jsx("div", { className: "service-selection-list", children:
            SERVICE_TYPES.map(service => (
                jsx("button", { className: "button", onClick: () => onSelectService(service), children: service }, service)
            ))
        })
    ]});
};

const OperatorLocationSelect = ({ locations, city, onLocationSet }) => {
    const [manualLocationName, setManualLocationName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [gpsLocation, setGpsLocation] = useState(null);
    const [error, setError] = useState(null);
    const [nearbyLocation, setNearbyLocation] = useState(null);

    const cityLocations = locations.filter(l => l.city === city);

    useEffect(() => {
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const currentCoords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                setGpsLocation(currentCoords);
                setError(null);
                const closest = cityLocations
                    .filter(l => l.coords)
                    .map(l => ({ ...l, distance: calculateDistance(currentCoords, l.coords) }))
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

    const handleSelectFromList = (loc) => {
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

    return jsxs("div", { className: "card", children: [
        jsx("h2", { children: `Selecione o Local em "${city}"` }),
        error && jsx("p", { className: "text-danger", children: error }),

        !gpsLocation && !error && jsx(Loader, { text: "Obtendo sinal de GPS..." }),
        gpsLocation && !nearbyLocation && jsx(Loader, { text: "Procurando locais próximos..." }),

        nearbyLocation && (
            jsxs("div", { className: "card-inset", children: [
                jsx("h4", { children: "Local Próximo Encontrado via GPS" }),
                jsx("p", { children: jsx("strong", { children: nearbyLocation.name }) }),
                jsx("p", { children: "Você está neste local?" }),
                jsx("button", { className: "button", onClick: handleConfirmNearby, children: "Sim, Confirmar e Continuar" })
            ]})
        ),
        
         jsxs("div", { className: "card-inset", children: [
            jsx("h4", { children: "Ou, busque na lista" }),
            jsx("input", { 
                type: "search", 
                placeholder: "Digite para buscar um local...", 
                value: searchQuery,
                onChange: e => setSearchQuery(e.target.value),
                style: {marginBottom: '1rem'}
            }),
            jsx("div", { className: "location-selection-list", children:
                filteredLocations.length > 0 ? filteredLocations.map(loc => (
                    jsx("button", { className: "button button-secondary", onClick: () => handleSelectFromList(loc), children: loc.name }, loc.id)
                )) : jsx("p", { children: "Nenhum local encontrado com esse nome." })
            })
         ]}),

         jsxs("div", { className: "card-inset", children: [
            jsx("h4", { children: "Ou, crie um novo local" }),
            jsx("input", { type: "text", placeholder: "Digite o nome do NOVO local", value: manualLocationName, onChange: e => setManualLocationName(e.target.value) }),
            jsx("button", { className: "button", onClick: handleConfirmNewManual, disabled: !manualLocationName.trim(), children: "Confirmar Novo Local" })
         ]})
    ]});
};

const PhotoStep = ({ phase, onComplete, onCancel }) => {
    const [photos, setPhotos] = useState([]);
    const [isTakingPhoto, setIsTakingPhoto] = useState(false);
    const fileInputRef = useRef(null);
    const title = phase === 'BEFORE' ? 'Fotos Iniciais ("Antes")' : 'Fotos Finais ("Depois")';
    const instruction = `Capture fotos do local ${phase === 'BEFORE' ? 'antes' : 'após'} o serviço. Tire quantas quiser. Pressione 'Encerrar' quando terminar.`;

    const handleCapture = (dataUrl) => {
        setPhotos(p => [...p, dataUrl]);
    };

    const handleFileSelect = (event) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target?.result;
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

    if (isTakingPhoto) {
        return jsx(CameraView, { onCapture: handleCapture, onCancel: () => setIsTakingPhoto(false), onFinish: () => setIsTakingPhoto(false), photoCount: photos.length });
    }

    return jsxs("div", { className: "card", children: [
        jsx("h2", { children: title }),
        jsx("p", { children: instruction }),
        jsxs("div", { className: "photo-section", children: [
            jsx("h3", { children: `Fotos Capturadas (${photos.length})` }),
            jsx("div", { className: "photo-gallery", children:
                photos.map((p, i) => jsx("img", { src: p, alt: `Foto ${i + 1}`, className: "image-preview" }, i))
            }),
            jsx("input", {
                type: "file",
                ref: fileInputRef,
                onChange: handleFileSelect,
                style: { display: 'none' },
                accept: "image/*"
            }),
            jsxs("div", { className: "photo-actions", children: [
                jsx("button", { className: "button", onClick: () => setIsTakingPhoto(true), children: `📷 ${photos.length > 0 ? 'Tirar Outra Foto' : 'Iniciar Captura'}` }),
                jsx("button", { className: "button button-secondary", onClick: handleUploadClick, children: "🖼️ Adicionar Foto do Dispositivo" })
            ] })
        ] }),
        jsxs("div", { style: { display: 'flex', gap: '1rem', marginTop: '1rem' }, children: [
            jsx("button", { className: "button button-danger", onClick: onCancel, children: "Cancelar" }),
            jsx("button", { className: "button button-success", onClick: () => onComplete(photos), disabled: photos.length === 0, children: "✅ Encerrar Captação" })
        ] })
    ] });
};

const ConfirmStep = ({ recordData, onSave, onCancel }) => (
    jsxs("div", { className: "card", children: [
        jsx("h2", { children: "Confirmação e Salvamento" }),
        jsxs("div", { className: "detail-section", style: {textAlign: 'left'}, children: [
            jsxs("p", { children: [ jsx("strong", { children: "Cidade:" }), ` ${recordData.locationCity}` ] }),
            jsxs("p", { children: [ jsx("strong", { children: "Serviço:" }), ` ${recordData.serviceType}` ] }),
            jsxs("p", { children: [ jsx("strong", { children: "Local:" }), ` ${recordData.locationName} ${recordData.gpsUsed ? '📍(GPS)' : ''}` ] }),
            jsxs("p", { children: [ jsx("strong", { children: "Data/Hora:" }), ` ${formatDateTime(new Date().toISOString())}` ] }),
            recordData.locationArea ? jsxs("p", { children: [ jsx("strong", { children: "Metragem:" }), ` ${recordData.locationArea} m²` ] }) : jsx("p", { children: [ jsx("strong", { children: "Metragem:" }), " Não informada (novo local)" ] }),
            
            jsx("h3", { children: `Fotos "Antes" (${recordData.beforePhotos?.length})` }),
            jsx("div", { className: "photo-gallery", children: recordData.beforePhotos?.map((p,i) => jsx("img", { src: p, alt: `Antes ${i+1}`, className: "image-preview" }, i))}),
            
            jsx("h3", { children: `Fotos "Depois" (${recordData.afterPhotos?.length})` }),
            jsx("div", { className: "photo-gallery", children: recordData.afterPhotos?.map((p,i) => jsx("img", { src: p, alt: `Depois ${i+1}`, className: "image-preview" }, i))})
        ]}),
        jsxs("div", { style: {display: 'flex', gap: '1rem'}, children: [
            jsx("button", { className: "button button-danger", onClick: onCancel, children: "Cancelar" }),
            jsx("button", { className: "button button-success", onClick: onSave, children: "✅ Salvar Registro" })
        ]})
    ]})
);

const HistoryView = ({ records, onSelect, isAdmin }) => (
    jsx("div", { children: 
        records.length === 0 ? jsx("p", { style: {textAlign: 'center'}, children: "Nenhum serviço registrado ainda." })
        : (
            jsx("ul", { className: "history-list", children:
                records.map(record => (
                    jsxs("li", { className: "list-item", onClick: () => onSelect(record), children: [
                        jsxs("p", { children: [ jsx("strong", { children: "Local:" }), ` ${record.locationName}, ${record.locationCity} `, record.gpsUsed && jsx("span", { className: "gps-indicator", children: "📍" }) ] }),
                        jsxs("p", { children: [ jsx("strong", { children: "Serviço:" }), ` ${record.serviceType}` ] }),
                        jsxs("p", { children: [ jsx("strong", { children: "Data:" }), ` ${formatDateTime(record.startTime)}` ] }),
                        isAdmin && jsxs("p", { children: [ jsx("strong", { children: "Operador:" }), ` ${record.operatorName}` ] }),
                        jsxs("div", { className: "history-item-photos", children: [
                           record.beforePhotos.slice(0,2).map((p,i) => jsx("img", { src: p }, `b-${i}`)),
                           record.afterPhotos.slice(0,2).map((p,i) => jsx("img", { src: p }, `a-${i}`))
                        ]})
                    ]}, record.id)
                ))
            })
        )
    })
);

const DetailView = ({ record }) => (
     jsxs("div", { className: "detail-view", children: [
        jsxs("div", { className: "detail-section card", children: [
            jsx("h3", { children: "Resumo" }),
            jsxs("p", { children: [ jsx("strong", { children: "Cidade:" }), ` ${record.locationCity}` ] }),
            jsxs("p", { children: [ jsx("strong", { children: "Local:" }), ` ${record.locationName} `, record.gpsUsed && jsx("span", { className: 'gps-indicator', children: "📍(GPS)" }) ] }),
            jsxs("p", { children: [ jsx("strong", { children: "Serviço:" }), ` ${record.serviceType}` ] }),
            record.locationArea ? jsxs("p", { children: [ jsx("strong", { children: "Metragem:" }), ` ${record.locationArea} m²` ] }) : jsx("p", { children: [ jsx("strong", { children: "Metragem:" }), " Não informada" ] }),
            jsxs("p", { children: [ jsx("strong", { children: "Operador:" }), ` ${record.operatorName}` ] }),
            jsxs("p", { children: [ jsx("strong", { children: "Início:" }), ` ${formatDateTime(record.startTime)}` ] }),
            jsxs("p", { children: [ jsx("strong", { children: "Fim:" }), ` ${formatDateTime(record.endTime)}` ] })
        ]}),
        jsxs("div", { className: "detail-section card", children: [
            jsx("h3", { children: `Fotos "Antes" (${record.beforePhotos.length})` }),
            jsx("div", { className: "photo-gallery", children: record.beforePhotos.map((p,i) => jsx("img", { src: p, alt: `Antes ${i+1}` }, i))})
        ]}),
        jsxs("div", { className: "detail-section card", children: [
            jsx("h3", { children: `Fotos "Depois" (${record.afterPhotos.length})` }),
            jsx("div", { className: "photo-gallery", children: record.afterPhotos.map((p,i) => jsx("img", { src: p, alt: `Depois ${i+1}` }, i))})
        ]})
    ]})
);

const ReportsView = ({ records, locations, forcedCity }) => {
    const [reportType, setReportType] = useState(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedServices, setSelectedServices] = useState([]);
    const [selectedCity, setSelectedCity] = useState(forcedCity || '');
    const [selectedIds, setSelectedIds] = useState([]);
    const printableRef = useRef(null);
    
    const cities = forcedCity ? [forcedCity] : ['', ...new Set(locations.map(l => l.city))].sort();

    const handleServiceFilterChange = (service, isChecked) => {
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

    const handleSelectAll = (e) => {
        if(e.target.checked) setSelectedIds(filteredRecords.map(r => r.id));
        else setSelectedIds([]);
    }

    const handleSelectOne = (id, isChecked) => {
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
            const page = pages[i];
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
            jsxs("div", { className: "card", children: [
                jsx("h2", { children: "Selecione o Tipo de Relatório" }),
                jsxs("div", { className: "button-group", style:{flexDirection: 'column', gap: '1rem'}, children: [
                    jsx("button", { className: "button", onClick: () => setReportType('excel'), children: "📊 Relatório Planilha de Excel" }),
                    jsx("button", { className: "button button-secondary", onClick: () => setReportType('photos'), children: "🖼️ Relatório de Fotografias (PDF)" })
                ]})
            ]})
        )
    }

    return jsxs("div", { children: [
        jsxs("div", { className: "card report-filters", children: [
            jsxs("div", { className: "form-group", children: [
                jsx("label", { htmlFor: "start-date", children: "Data de Início" }),
                jsx("input", { id: "start-date", type: "date", value: startDate, onChange: e => setStartDate(e.target.value) })
            ]}),
            jsxs("div", { className: "form-group", children: [
                jsx("label", { htmlFor: "end-date", children: "Data Final" }),
                jsx("input", { id: "end-date", type: "date", value: endDate, onChange: e => setEndDate(e.target.value) })
            ]}),
             jsxs("div", { className: "form-group", children: [
                jsx("label", { htmlFor: "city-filter", children: "Cidade / Contrato" }),
                jsx("select", { id: "city-filter", value: selectedCity, onChange: e => setSelectedCity(e.target.value), disabled: !!forcedCity, children:
                    cities.map(city => (
                        jsx("option", { value: city, children: city || 'Todas as Cidades' }, city)
                    ))
                })
            ]}),
            jsxs("fieldset", { className: "form-group-full", children: [
                jsx("legend", { children: "Filtrar por Serviço" }),
                jsx("div", { className: "checkbox-group", children:
                    SERVICE_TYPES.map(service => (
                        jsxs("div", { className: "checkbox-item", children: [
                            jsx("input", { type: "checkbox", id: `service-${service}`, checked: selectedServices.includes(service), onChange: e => handleServiceFilterChange(service, e.target.checked) }),
                            jsx("label", { htmlFor: `service-${service}`, children: service })
                        ]}, service)
                    ))
                })
            ]})
        ]}),

        jsxs("div", { className: "report-list", children: [
            filteredRecords.length > 0 && (
                 jsxs("div", { className: "report-item", children: [
                    jsx("input", { type: "checkbox", onChange: handleSelectAll, checked: selectedIds.length === filteredRecords.length && filteredRecords.length > 0 }),
                    jsx("div", { className: "report-item-info", children: jsx("strong", { children: "Selecionar Todos" }) })
                ]})
            ),
            filteredRecords.map(r => (
                jsxs("div", { className: "report-item", children: [
                    jsx("input", { type: "checkbox", checked: selectedIds.includes(r.id), onChange: e => handleSelectOne(r.id, e.target.checked) }),
                    jsxs("div", { className: "report-item-info", children: [
                        jsxs("p", { children: [jsx("strong", { children: `${r.locationName}, ${r.locationCity}` })] }),
                        jsx("p", { children: `${r.serviceType} - ${formatDateTime(r.startTime)} - ${r.locationArea || 0} m²` })
                    ]})
                ]}, r.id)
            ))
        ]}),

        selectedIds.length > 0 && (
            jsxs("div", { className: "report-summary card", children: [
                jsx("h3", { children: "Resumo da Exportação" }),
                jsx("p", { children: `${selectedRecords.length} registro(s) selecionado(s).` }),
                jsxs("p", { children: ["Total de metragem: ", jsx("strong", { children: `${totalArea.toLocaleString('pt-BR')} m²` })] }),
                jsxs("div", { className: "button-group", children: [
                    reportType === 'excel' && jsx("button", { className: "button", onClick: handleExportExcel, children: "📊 Exportar Excel" }),
                    reportType === 'photos' && jsx("button", { className: "button button-secondary", onClick: handleExportPdf, children: "🖼️ Exportar PDF c/ Fotos" })
                ]})
            ]})
        ),
        
        jsx("div", { className: "printable-report", ref: printableRef, children:
            selectedRecords.map(r => (
                jsxs("div", { className: "printable-report-page", children: [
                    jsxs("div", { className: "printable-page-header", children: [
                        jsx("h2", { children: "Relatório de Serviço - CRB Serviços" }),
                        jsxs("p", { children: [jsx("strong", { children: "Cidade:" }), ` ${r.locationCity}`] }),
                        jsxs("p", { children: [jsx("strong", { children: "Local:" }), ` ${r.locationName}`] }),
                        jsxs("p", { children: [jsx("strong", { children: "Serviço:" }), ` ${r.serviceType}`] }),
                        jsxs("p", { children: [jsx("strong", { children: "Data:" }), ` ${formatDateTime(r.startTime)}`] }),
                        jsxs("p", { children: [jsx("strong", { children: "Metragem:" }), ` ${r.locationArea ? `${r.locationArea.toLocaleString('pt-BR')} m²` : 'Não informada'}`] })
                    ]}),
                    jsx("h3", { children: 'Fotos "Antes"' }),
                    jsx("div", { className: "printable-report-gallery", children:
                        r.beforePhotos.map((p, i) => (
                            jsxs("div", { className: "photo-item-container", children: [
                                jsx("img", { src: p, alt: `Foto Antes ${i + 1}` }),
                                jsxs("p", { className: "caption", children: ["Antes ", i + 1] })
                            ]}, `before-${i}`)
                        ))
                    }),
                    jsx("h3", { children: 'Fotos "Depois"' }),
                    jsx("div", { className: "printable-report-gallery", children:
                        r.afterPhotos.map((p, i) => (
                            jsxs("div", { className: "photo-item-container", children: [
                                jsx("img", { src: p, alt: `Foto Depois ${i + 1}` }),
                                jsxs("p", { className: "caption", children: ["Depois ", i + 1] })
                            ]}, `after-${i}`)
                        ))
                    })
                ]}, r.id)
            ))
        })
    ]});
};

const ManageLocationsView = ({ locations, setLocations }) => {
    const [city, setCity] = useState('');
    const [name, setName] = useState('');
    const [area, setArea] = useState('');
    const [coords, setCoords] = useState(null);
    const [isFetchingCoords, setIsFetchingCoords] = useState(false);
    const [editingId, setEditingId] = useState(null);

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
    
    const handleCoordChange = (field, valueStr) => {
        const value = parseFloat(valueStr);
        setCoords(curr => {
            const newCoords = { ...(curr || {}) };
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

        const newLocation = {
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

    const handleEdit = (loc) => {
        setEditingId(loc.id);
        setCity(loc.city);
        setName(loc.name);
        setArea(String(loc.area));
        setCoords(loc.coords || null);
    };

    const handleDelete = (id) => {
        if(window.confirm('Excluir este local?')) {
            setLocations(locations.filter(l => l.id !== id));
        }
    };

    return jsxs("div", { children: [
        jsxs("div", { className: "form-container card", children: [
            jsx("h3", { children: editingId ? 'Editando Local' : 'Adicionar Novo Local' }),
            jsx("input", { type: "text", placeholder: "Cidade / Contrato", value: city, onChange: e => setCity(e.target.value) }),
            jsx("input", { type: "text", placeholder: "Nome do Local", value: name, onChange: e => setName(e.target.value) }),
            jsx("input", { type: "number", placeholder: "Metragem (m²)", value: area, onChange: e => setArea(e.target.value) }),
            
            jsxs("div", { className: "form-group", style: {marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem'}, children: [
                 jsx("label", { children: "Coordenadas GPS (Opcional)" }),
                 jsx("p", { style: {fontSize: '0.8rem', color: '#666', margin: '0.25rem 0'}, children: "Preencha manualmente ou clique no botão para capturar as coordenadas GPS atuais." }),
                 jsxs("div", { className: "coord-inputs", children: [
                    jsx("input", { type: "number", step: "any", placeholder: "Latitude", value: coords?.latitude ?? '', onChange: e => handleCoordChange('latitude', e.target.value) }),
                    jsx("input", { type: "number", step: "any", placeholder: "Longitude", value: coords?.longitude ?? '', onChange: e => handleCoordChange('longitude', e.target.value) })
                 ]}),
                 jsx("button", { className: "button button-secondary", onClick: handleGetCoordinates, disabled: isFetchingCoords, children:
                    isFetchingCoords ? 'Obtendo GPS...' : '📍 Obter Coordenadas GPS Atuais'
                })
            ]}),

            jsx("button", { className: "button admin-button", onClick: handleSave, children: editingId ? 'Salvar Alterações' : 'Adicionar Local' }),
            editingId && jsx("button", { className: "button button-secondary", onClick: resetForm, children: "Cancelar Edição" })
        ]}),
        jsx("ul", { className: "location-list", children:
            locations.sort((a,b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name)).map(loc => (
                jsxs("li", { className: "card list-item", children: [
                    jsxs("div", { className: "list-item-header", children: [
                        jsx("h3", { children: loc.name }),
                        jsxs("div", { children: [
                            jsx("button", { className: "button button-sm admin-button", onClick: () => handleEdit(loc), children: "Editar" }),
                            jsx("button", { className: "button button-sm button-danger", onClick: () => handleDelete(loc.id), children: "Excluir" })
                        ]})
                    ]}),
                    jsxs("p", { children: [jsx("strong", { children: "Cidade:" }), ` ${loc.city}`] }),
                    jsxs("p", { children: [jsx("strong", { children: "Metragem:" }), ` ${loc.area} m²`] }),
                    loc.coords && jsxs("p", { children: [jsx("strong", { children: "GPS:" }), " Sim ", jsx("span", { className: "gps-indicator", children: "📍" })] })
                ]}, loc.id)
            ))
        })
    ]});
};

const ManageUsersView = ({ users, setUsers, locations }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('OPERATOR');
    const [assignedCity, setAssignedCity] = useState('');
    const [editingId, setEditingId] = useState(null);

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

        const newUser = { 
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

    const handleEdit = (user) => {
        setEditingId(user.id);
        setUsername(user.username);
        setPassword(user.password || '');
        setRole(user.role);
        setAssignedCity(user.assignedCity || '');
    };

    const handleDelete = (id) => {
        if(window.confirm('Excluir este usuário?')) {
            setUsers(users.filter(u => u.id !== id));
        }
    };
    
    return jsxs("div", { children: [
        jsxs("div", { className: "form-container card", children: [
            jsx("h3", { children: editingId ? 'Editando Funcionário' : 'Adicionar Novo Funcionário' }),
            jsx("input", { type: "text", placeholder: "Nome de usuário", value: username, onChange: e => setUsername(e.target.value) }),
            jsx("input", { type: "text", placeholder: "Senha", value: password, onChange: e => setPassword(e.target.value) }),
            jsxs("select", { value: role, onChange: e => setRole(e.target.value), children: [
                jsx("option", { value: "ADMIN", children: "Administrador" }),
                jsx("option", { value: "OPERATOR", children: "Operador" }),
                jsx("option", { value: "FISCAL", children: "Fiscalização" })
            ]}),
            (role === 'OPERATOR' || role === 'FISCAL') && (
                jsxs("select", { value: assignedCity, onChange: e => setAssignedCity(e.target.value), children: [
                    jsx("option", { value: "", children: "Selecione a Cidade/Contrato" }),
                    cities.map(c => jsx("option", { value: c, children: c }, c))
                ]})
            ),
            jsx("button", { className: "button admin-button", onClick: handleSave, children: editingId ? 'Salvar Alterações' : 'Adicionar' }),
            editingId && jsx("button", { className: "button button-secondary", onClick: resetForm, children: "Cancelar" })
        ]}),
        jsx("ul", { className: "location-list", children:
             users.map(user => (
                jsxs("li", { className: "card list-item", children: [
                    jsxs("div", { className: "list-item-header", children: [
                        jsx("h3", { children: user.username }),
                        jsxs("div", { children: [
                            jsx("button", { className: "button button-sm admin-button", onClick: () => handleEdit(user), children: "Editar" }),
                            jsx("button", { className: "button button-sm button-danger", onClick: () => handleDelete(user.id), children: "Excluir" })
                        ]})
                    ]}),
                    jsxs("p", { children: [jsx("strong", { children: "Função:" }), ` ${user.role}`] }),
                    user.assignedCity && jsxs("p", { children: [jsx("strong", { children: "Cidade/Contrato:" }), ` ${user.assignedCity}`] })
                ]}, user.id)
             ))
        })
    ]});
};

const ManageGoalsView = ({ goals, setGoals, records, locations }) => {
    const [city, setCity] = useState('');
    const [month, setMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
    const [targetArea, setTargetArea] = useState('');
    const [editingId, setEditingId] = useState(null);

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
        const newGoal = {
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

    const handleEdit = (goal) => {
        setEditingId(goal.id);
        setCity(goal.city);
        setMonth(goal.month);
        setTargetArea(String(goal.targetArea));
    };

    const handleDelete = (id) => {
        if (window.confirm('Excluir esta meta?')) {
            setGoals(goals.filter(g => g.id !== id));
        }
    };

    return jsxs("div", { children: [
        jsxs("div", { className: "form-container card", children: [
            jsx("h3", { children: editingId ? 'Editando Meta' : 'Adicionar Nova Meta' }),
            jsxs("select", { value: city, onChange: e => setCity(e.target.value), children: [
                jsx("option", { value: "", children: "Selecione a Cidade/Contrato" }),
                cities.map(c => jsx("option", { value: c, children: c }, c))
            ]}),
            jsx("input", { type: "month", value: month, onChange: e => setMonth(e.target.value) }),
            jsx("input", { type: "number", placeholder: "Meta de Metragem (m²)", value: targetArea, onChange: e => setTargetArea(e.target.value) }),
            jsx("button", { className: "button admin-button", onClick: handleSave, children: editingId ? 'Salvar Alterações' : 'Adicionar Meta' }),
            editingId && jsx("button", { className: "button button-secondary", onClick: resetForm, children: "Cancelar Edição" })
        ]}),
        jsx("ul", { className: "goal-list", children:
            goals.sort((a,b) => b.month.localeCompare(a.month) || a.city.localeCompare(b.city)).map(goal => {
                const realizedArea = records
                    .filter(r => r.locationCity === goal.city && r.startTime.startsWith(goal.month))
                    .reduce((sum, r) => sum + (r.locationArea || 0), 0);
                
                const percentage = goal.targetArea > 0 ? (realizedArea / goal.targetArea) * 100 : 0;
                const remainingArea = Math.max(0, goal.targetArea - realizedArea);

                return (
                    jsxs("li", { className: "card list-item progress-card", children: [
                         jsxs("div", { className: "list-item-header", children: [
                            jsx("h3", { children: `${goal.city} - ${goal.month}` }),
                            jsxs("div", { children: [
                                jsx("button", { className: "button button-sm admin-button", onClick: () => handleEdit(goal), children: "Editar" }),
                                jsx("button", { className: "button button-sm button-danger", onClick: () => handleDelete(goal.id), children: "Excluir" })
                            ]})
                        ]}),
                        jsxs("div", { className: "progress-info", children: [
                            jsx("span", { children: `Realizado: ${realizedArea.toLocaleString('pt-BR')} / ${goal.targetArea.toLocaleString('pt-BR')} m²` }),
                            jsx("span", { children: `${percentage.toFixed(1)}%` })
                        ]}),
                        jsx("div", { className: "progress-bar-container", children:
                            jsx("div", { className: "progress-bar", style: { width: `${Math.min(percentage, 100)}%` } })
                        }),
                         jsx("p", { className: "remaining-info", children: `Faltam: ${remainingArea.toLocaleString('pt-BR')} m² para atingir a meta.` })
                    ]}, goal.id)
                );
            })
        })
    ]});
};


// --- Componente Principal ---
const App = () => {
  const [view, setView] = useState('LOGIN');
  const [currentUser, setCurrentUser] = useLocalStorage('crbCurrentUser', null);
  const [users, setUsers] = useLocalStorage('crbUsers', DEFAULT_USERS);
  const [locations, setLocations] = useLocalStorage('crbLocations', []);
  const [records, setRecords] = useLocalStorage('crbServiceRecords', []);
  const [goals, setGoals] = useLocalStorage('crbGoals', []);
  
  const [currentService, setCurrentService] = useState({});
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [history, setHistory] = useState([]);

  const navigate = (newView, replace = false) => {
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
  
  const redirectUser = (user) => {
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

  const handleLogin = (user) => {
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
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const restoredData = JSON.parse(event.target?.result);
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

  const handleCitySelect = (city) => {
      setSelectedCity(city);
      navigate('OPERATOR_SERVICE_SELECT');
  }

  const handleServiceSelect = (serviceType) => {
    setCurrentService({ serviceType });
    navigate('OPERATOR_LOCATION_SELECT');
  };

  const handleLocationSet = (locData) => {
      setCurrentService(s => ({...s, ...locData}));
      navigate('PHOTO_STEP');
  };

  const handleBeforePhotos = (photos) => {
      setCurrentService(s => ({...s, beforePhotos: photos, startTime: new Date().toISOString() }));
  };

  const handleAfterPhotos = (photos) => {
      setCurrentService(s => ({...s, afterPhotos: photos}));
      navigate('CONFIRM_STEP');
  };

  const handleSave = () => {
    if(!currentUser) return;
    const finalRecord = {
        id: new Date().toISOString(),
        endTime: new Date().toISOString(),
        operatorId: currentUser.id,
        operatorName: currentUser.username,
        ...currentService
    };

    setRecords(prev => [finalRecord, ...prev]);

    // Se for um local novo, adiciona na lista de locais para o admin completar
    if(!finalRecord.locationId) {
        const newLocation = {
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

  const handleSelectRecord = (record) => {
    setSelectedRecord(record);
    navigate('DETAIL');
  }

  const renderView = () => {
    if (!currentUser) {
        return jsx(Login, { onLogin: handleLogin, users: users });
    }
    
    switch(currentUser.role) {
        case 'ADMIN':
            switch(view) {
                case 'ADMIN_DASHBOARD': return jsx(AdminDashboard, { onNavigate: navigate, onBackup: handleBackup, onRestore: handleRestore });
                case 'ADMIN_MANAGE_LOCATIONS': return jsx(ManageLocationsView, { locations: locations, setLocations: setLocations });
                case 'ADMIN_MANAGE_USERS': return jsx(ManageUsersView, { users: users, setUsers: setUsers, locations: locations });
                case 'ADMIN_MANAGE_GOALS': return jsx(ManageGoalsView, { goals: goals, setGoals: setGoals, records: records, locations: locations });
                case 'REPORTS': return jsx(ReportsView, { records: records, locations: locations });
                case 'HISTORY': return jsx(HistoryView, { records: records, onSelect: handleSelectRecord, isAdmin: true });
                case 'DETAIL': return selectedRecord ? jsx(DetailView, { record: selectedRecord }) : jsx("p", { children: "Registro não encontrado." });
                default: setView('ADMIN_DASHBOARD'); return null;
            }
        
        case 'FISCAL':
            const fiscalRecords = records.filter(r => r.locationCity === currentUser.assignedCity);
            switch(view) {
                case 'FISCAL_DASHBOARD': return jsx(FiscalDashboard, { onNavigate: navigate });
                case 'REPORTS': return jsx(ReportsView, { records: fiscalRecords, locations: locations, forcedCity: currentUser.assignedCity });
                case 'HISTORY': return jsx(HistoryView, { records: fiscalRecords, onSelect: handleSelectRecord, isAdmin: true });
                case 'DETAIL':
                    const canView = selectedRecord && selectedRecord.locationCity === currentUser.assignedCity;
                    return canView ? jsx(DetailView, { record: selectedRecord }) : jsx("p", { children: "Registro não encontrado ou acesso não permitido." });
                default: setView('FISCAL_DASHBOARD'); return null;
            }

        case 'OPERATOR':
            switch(view) {
                case 'OPERATOR_CITY_SELECT': return jsx(OperatorCitySelect, { locations: locations, onSelectCity: handleCitySelect });
                case 'OPERATOR_SERVICE_SELECT': return jsx(OperatorServiceSelect, { onSelectService: handleServiceSelect });
                case 'OPERATOR_LOCATION_SELECT': return selectedCity ? jsx(OperatorLocationSelect, { locations: locations, city: selectedCity, onLocationSet: handleLocationSet }) : null;
                case 'PHOTO_STEP': 
                    if(!currentService.beforePhotos) return jsx(PhotoStep, { phase: "BEFORE", onComplete: handleBeforePhotos, onCancel: resetService });
                    return jsx(PhotoStep, { phase: "AFTER", onComplete: handleAfterPhotos, onCancel: resetService });
                case 'CONFIRM_STEP': return jsx(ConfirmStep, { recordData: currentService, onSave: handleSave, onCancel: resetService });
                case 'HISTORY': 
                    const operatorRecords = records.filter(r => r.operatorId === currentUser.id);
                    return jsx(HistoryView, { records: operatorRecords, onSelect: handleSelectRecord, isAdmin: false });
                case 'DETAIL': return selectedRecord ? jsx(DetailView, { record: selectedRecord }) : jsx("p", { children: "Registro não encontrado." });
                default: setView(currentUser.assignedCity ? 'OPERATOR_SERVICE_SELECT' : 'OPERATOR_CITY_SELECT'); return null;
            }
        
        default:
             handleLogout();
             return null;
    }
  };

  return (
    jsxs("div", { className: "app-container", children: [
      jsx(Header, { view: view, currentUser: currentUser, onBack: view !== 'LOGIN' && view !== 'ADMIN_DASHBOARD' && view !== 'FISCAL_DASHBOARD' ? handleBack : undefined, onLogout: handleLogout }),
      jsx("main", { children: renderView() })
    ]})
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(jsx(App, {}));
}