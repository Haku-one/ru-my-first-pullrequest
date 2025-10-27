/**
 * СДЭК Карта с пунктами выдачи для WooCommerce
 * Интеграция Яндекс.Карт с API СДЭК
 */

class CDEKMapIntegration {
    constructor() {
        this.map = null;
        this.clusterer = null;
        this.currentCity = 'Махачкала'; // Получаем из формы адреса
        this.selectedOffice = null;
        this.offices = [];
        
        this.init();
    }

    async init() {
        // Ждем загрузки Яндекс.Карт API
        await this.loadYandexMaps();
        
        // Инициализируем карту
        this.initMap();
        
        // Загружаем пункты выдачи СДЭК
        await this.loadCDEKOffices();
        
        // Добавляем обработчики событий
        this.bindEvents();
    }

    loadYandexMaps() {
        return new Promise((resolve, reject) => {
            if (window.ymaps) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://api-maps.yandex.ru/2.1/?apikey=YOUR_YANDEX_API_KEY&lang=ru_RU';
            script.onload = () => {
                ymaps.ready(() => resolve());
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    initMap() {
        const mapContainer = document.querySelector('.wp-block-cdek-checkout-map-block');
        
        if (!mapContainer) {
            console.error('Контейнер для карты не найден');
            return;
        }

        // Создаем HTML структуру для карты
        mapContainer.innerHTML = `
            <div class="cdek-map-container">
                <div class="cdek-map-header">
                    <h3>Выберите пункт выдачи на карте</h3>
                    <div class="cdek-map-search">
                        <input type="text" id="cdek-city-search" placeholder="Поиск по городу..." value="${this.currentCity}">
                        <button type="button" id="cdek-search-btn">Найти</button>
                    </div>
                </div>
                <div class="cdek-map-wrapper">
                    <div id="cdek-yandex-map" style="width: 100%; height: 400px;"></div>
                    <div class="cdek-offices-sidebar">
                        <div class="cdek-offices-list">
                            <div class="cdek-loading">Загрузка пунктов выдачи...</div>
                        </div>
                    </div>
                </div>
                <div class="cdek-selected-office" style="display: none;">
                    <h4>Выбранный пункт выдачи:</h4>
                    <div class="cdek-office-info"></div>
                </div>
            </div>
        `;

        // Инициализируем Яндекс.Карту
        this.map = new ymaps.Map('cdek-yandex-map', {
            center: [42.9849, 47.5047], // Координаты Махачкалы
            zoom: 12,
            controls: ['zoomControl', 'fullscreenControl', 'geolocationControl']
        });

        // Создаем кластеризатор для меток
        this.clusterer = new ymaps.Clusterer({
            preset: 'islands#invertedVioletClusterIcons',
            groupByCoordinates: false,
            clusterDisableClickZoom: false,
            clusterHideIconOnBalloonOpen: false,
            geoObjectHideIconOnBalloonOpen: false
        });

        this.map.geoObjects.add(this.clusterer);
    }

    async loadCDEKOffices() {
        try {
            // Получаем координаты города
            const cityCoords = await this.getCityCoordinates(this.currentCity);
            
            if (cityCoords) {
                this.map.setCenter(cityCoords, 12);
            }

            // Загружаем пункты выдачи СДЭК
            const offices = await this.fetchCDEKOffices(this.currentCity);
            this.offices = offices;
            
            // Отображаем офисы на карте
            this.displayOfficesOnMap(offices);
            
            // Отображаем список офисов в боковой панели
            this.displayOfficesList(offices);
            
        } catch (error) {
            console.error('Ошибка загрузки пунктов выдачи:', error);
            this.showError('Не удалось загрузить пункты выдачи');
        }
    }

    async getCityCoordinates(cityName) {
        try {
            const response = await ymaps.geocode(cityName);
            const firstGeoObject = response.geoObjects.get(0);
            return firstGeoObject ? firstGeoObject.geometry.getCoordinates() : null;
        } catch (error) {
            console.error('Ошибка геокодирования:', error);
            return null;
        }
    }

    async fetchCDEKOffices(city) {
        // Здесь должен быть вызов к вашему backend для получения офисов СДЭК
        // Пример структуры данных:
        
        try {
            const response = await fetch('/wp-json/cdek/v1/offices', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-WP-Nonce': cdekMapData.nonce // Nonce для безопасности WordPress
                },
                body: JSON.stringify({
                    city: city,
                    type: 'PVZ' // Пункты выдачи
                })
            });

            if (!response.ok) {
                throw new Error('Ошибка загрузки данных');
            }

            return await response.json();
        } catch (error) {
            console.error('Ошибка API СДЭК:', error);
            
            // Возвращаем тестовые данные для демонстрации
            return this.getTestOffices();
        }
    }

    getTestOffices() {
        // Тестовые данные для демонстрации
        return [
            {
                code: 'MSK1',
                name: 'СДЭК на Ленина',
                address: 'ул. Ленина, 45',
                coordinates: [42.9849, 47.5047],
                workTime: 'Пн-Пт: 9:00-18:00, Сб: 10:00-16:00',
                phone: '+7 (8722) 123-456',
                type: 'PVZ'
            },
            {
                code: 'MSK2',
                name: 'СДЭК на Гамидова',
                address: 'пр. Гамидова, 12',
                coordinates: [42.9749, 47.5147],
                workTime: 'Пн-Вс: 10:00-20:00',
                phone: '+7 (8722) 654-321',
                type: 'PVZ'
            },
            {
                code: 'MSK3',
                name: 'СДЭК в ТЦ Каспий',
                address: 'ул. Дахадаева, 88, ТЦ Каспий',
                coordinates: [42.9949, 47.4947],
                workTime: 'Пн-Вс: 10:00-22:00',
                phone: '+7 (8722) 789-012',
                type: 'PVZ'
            }
        ];
    }

    displayOfficesOnMap(offices) {
        // Очищаем кластеризатор
        this.clusterer.removeAll();

        const placemarks = offices.map(office => {
            const placemark = new ymaps.Placemark(
                office.coordinates,
                {
                    balloonContentHeader: office.name,
                    balloonContentBody: `
                        <div class="cdek-balloon">
                            <p><strong>Адрес:</strong> ${office.address}</p>
                            <p><strong>Время работы:</strong> ${office.workTime}</p>
                            <p><strong>Телефон:</strong> ${office.phone}</p>
                            <button class="cdek-select-office-btn" data-office-code="${office.code}">
                                Выбрать этот пункт
                            </button>
                        </div>
                    `,
                    balloonContentFooter: `Код: ${office.code}`
                },
                {
                    preset: 'islands#violetDotIconWithCaption',
                    iconCaptionMaxWidth: '200'
                }
            );

            // Обработчик клика по метке
            placemark.events.add('click', () => {
                this.selectOffice(office);
            });

            return placemark;
        });

        this.clusterer.add(placemarks);
    }

    displayOfficesList(offices) {
        const listContainer = document.querySelector('.cdek-offices-list');
        
        if (offices.length === 0) {
            listContainer.innerHTML = '<div class="cdek-no-offices">Пункты выдачи не найдены</div>';
            return;
        }

        const officesHTML = offices.map(office => `
            <div class="cdek-office-item" data-office-code="${office.code}">
                <div class="cdek-office-name">${office.name}</div>
                <div class="cdek-office-address">${office.address}</div>
                <div class="cdek-office-time">${office.workTime}</div>
                <div class="cdek-office-phone">${office.phone}</div>
                <button class="cdek-select-office-btn" data-office-code="${office.code}">
                    Выбрать
                </button>
            </div>
        `).join('');

        listContainer.innerHTML = officesHTML;
    }

    selectOffice(office) {
        this.selectedOffice = office;
        
        // Обновляем отображение выбранного офиса
        const selectedContainer = document.querySelector('.cdek-selected-office');
        const infoContainer = document.querySelector('.cdek-office-info');
        
        infoContainer.innerHTML = `
            <div class="cdek-selected-info">
                <strong>${office.name}</strong><br>
                ${office.address}<br>
                ${office.workTime}<br>
                ${office.phone}
            </div>
        `;
        
        selectedContainer.style.display = 'block';

        // Подсвечиваем выбранный офис в списке
        document.querySelectorAll('.cdek-office-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        const selectedItem = document.querySelector(`[data-office-code="${office.code}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }

        // Центрируем карту на выбранном офисе
        this.map.setCenter(office.coordinates, 15);

        // Обновляем скрытое поле с выбранным офисом для отправки в форме
        this.updateHiddenField(office);

        // Обновляем методы доставки
        this.updateShippingMethods(office);
    }

    updateHiddenField(office) {
        // Создаем или обновляем скрытое поле с данными выбранного офиса
        let hiddenField = document.getElementById('selected-cdek-office');
        
        if (!hiddenField) {
            hiddenField = document.createElement('input');
            hiddenField.type = 'hidden';
            hiddenField.id = 'selected-cdek-office';
            hiddenField.name = 'selected_cdek_office';
            document.querySelector('.wc-block-components-form').appendChild(hiddenField);
        }

        hiddenField.value = JSON.stringify({
            code: office.code,
            name: office.name,
            address: office.address
        });
    }

    updateShippingMethods(office) {
        // Обновляем методы доставки в зависимости от выбранного офиса
        const shippingMethods = document.querySelectorAll('input[name="radio-control-1"]');
        
        shippingMethods.forEach(method => {
            const label = method.closest('label');
            const methodText = label.querySelector('.wc-block-components-radio-control__label').textContent;
            
            // Показываем только методы "склад-склад" для выбранного офиса
            if (methodText.includes('склад-склад') || methodText.includes('дверь-склад') || methodText.includes('постамат-склад')) {
                label.style.display = 'block';
            }
        });

        // Автоматически выбираем самый дешевый метод доставки до склада
        const cheapestMethod = document.querySelector('input[value="cdek_shipping_136"]'); // Посылка склад-склад
        if (cheapestMethod) {
            cheapestMethod.checked = true;
            cheapestMethod.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    bindEvents() {
        // Поиск по городу
        const searchBtn = document.getElementById('cdek-search-btn');
        const cityInput = document.getElementById('cdek-city-search');

        if (searchBtn && cityInput) {
            searchBtn.addEventListener('click', () => {
                this.searchCity(cityInput.value);
            });

            cityInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchCity(cityInput.value);
                }
            });
        }

        // Обработчики кнопок выбора офиса
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('cdek-select-office-btn')) {
                const officeCode = e.target.getAttribute('data-office-code');
                const office = this.offices.find(o => o.code === officeCode);
                if (office) {
                    this.selectOffice(office);
                }
            }
        });

        // Обработчик изменения адреса доставки
        const addressField = document.getElementById('shipping-address_1');
        if (addressField) {
            addressField.addEventListener('change', () => {
                const newCity = this.extractCityFromAddress(addressField.value);
                if (newCity && newCity !== this.currentCity) {
                    this.currentCity = newCity;
                    this.loadCDEKOffices();
                }
            });
        }
    }

    async searchCity(cityName) {
        if (!cityName.trim()) return;

        this.currentCity = cityName;
        document.querySelector('.cdek-offices-list').innerHTML = '<div class="cdek-loading">Загрузка пунктов выдачи...</div>';
        
        await this.loadCDEKOffices();
    }

    extractCityFromAddress(address) {
        // Простое извлечение города из адреса
        // В реальном проекте можно использовать более сложную логику
        return address.split(',')[0].trim();
    }

    showError(message) {
        const listContainer = document.querySelector('.cdek-offices-list');
        listContainer.innerHTML = `<div class="cdek-error">${message}</div>`;
    }
}

// Стили для карты
const mapStyles = `
<style>
.cdek-map-container {
    margin: 20px 0;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
}

.cdek-map-header {
    background: #f8f9fa;
    padding: 15px;
    border-bottom: 1px solid #ddd;
}

.cdek-map-header h3 {
    margin: 0 0 10px 0;
    font-size: 18px;
    color: #333;
}

.cdek-map-search {
    display: flex;
    gap: 10px;
}

.cdek-map-search input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
}

.cdek-map-search button {
    padding: 8px 16px;
    background: #007cba;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.cdek-map-search button:hover {
    background: #005a87;
}

.cdek-map-wrapper {
    display: flex;
    min-height: 400px;
}

#cdek-yandex-map {
    flex: 2;
}

.cdek-offices-sidebar {
    flex: 1;
    border-left: 1px solid #ddd;
    background: #fff;
    overflow-y: auto;
    max-height: 400px;
}

.cdek-offices-list {
    padding: 15px;
}

.cdek-office-item {
    padding: 15px;
    border-bottom: 1px solid #eee;
    cursor: pointer;
    transition: background-color 0.2s;
}

.cdek-office-item:hover {
    background: #f8f9fa;
}

.cdek-office-item.selected {
    background: #e3f2fd;
    border-left: 3px solid #007cba;
}

.cdek-office-name {
    font-weight: bold;
    color: #333;
    margin-bottom: 5px;
}

.cdek-office-address {
    color: #666;
    margin-bottom: 5px;
    font-size: 14px;
}

.cdek-office-time {
    color: #888;
    font-size: 12px;
    margin-bottom: 5px;
}

.cdek-office-phone {
    color: #007cba;
    font-size: 12px;
    margin-bottom: 10px;
}

.cdek-select-office-btn {
    background: #007cba;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
}

.cdek-select-office-btn:hover {
    background: #005a87;
}

.cdek-selected-office {
    background: #e8f5e8;
    padding: 15px;
    border-top: 1px solid #ddd;
}

.cdek-selected-office h4 {
    margin: 0 0 10px 0;
    color: #2e7d32;
}

.cdek-selected-info {
    color: #333;
    line-height: 1.4;
}

.cdek-loading {
    text-align: center;
    padding: 20px;
    color: #666;
}

.cdek-error {
    text-align: center;
    padding: 20px;
    color: #d32f2f;
    background: #ffebee;
    border-radius: 4px;
}

.cdek-no-offices {
    text-align: center;
    padding: 20px;
    color: #666;
}

.cdek-balloon {
    max-width: 250px;
}

.cdek-balloon p {
    margin: 5px 0;
}

.cdek-balloon button {
    background: #007cba;
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
    margin-top: 10px;
}

.cdek-balloon button:hover {
    background: #005a87;
}

@media (max-width: 768px) {
    .cdek-map-wrapper {
        flex-direction: column;
    }
    
    .cdek-offices-sidebar {
        border-left: none;
        border-top: 1px solid #ddd;
        max-height: 300px;
    }
    
    #cdek-yandex-map {
        height: 300px;
    }
}
</style>
`;

// Добавляем стили в документ
document.head.insertAdjacentHTML('beforeend', mapStyles);

// Инициализируем карту после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    // Проверяем, что мы на странице checkout и есть контейнер для карты
    if (document.querySelector('.wp-block-cdek-checkout-map-block')) {
        new CDEKMapIntegration();
    }
});