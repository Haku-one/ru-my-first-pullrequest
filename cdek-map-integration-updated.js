/**
 * СДЭК Карта с пунктами выдачи для WooCommerce - Обновленная версия
 * Интеграция Яндекс.Карт с API СДЭК через WordPress REST API
 */

class CDEKMapIntegration {
    constructor() {
        this.map = null;
        this.clusterer = null;
        this.currentCity = cdekMapData.currentCity || 'Махачкала';
        this.selectedOffice = null;
        this.offices = [];
        this.apiUrl = cdekMapData.apiUrl;
        this.nonce = cdekMapData.nonce;
        this.yandexApiKey = cdekMapData.yandexApiKey;
        
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

            const apiKey = this.yandexApiKey ? `&apikey=${this.yandexApiKey}` : '';
            const script = document.createElement('script');
            script.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU${apiKey}`;
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

        // Получаем координаты для начального отображения
        const initialCoords = this.getCityInitialCoords(this.currentCity);

        // Инициализируем Яндекс.Карту
        this.map = new ymaps.Map('cdek-yandex-map', {
            center: initialCoords,
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

    getCityInitialCoords(cityName) {
        // Координаты основных городов России
        const cityCoords = {
            'Махачкала': [42.9849, 47.5047],
            'Москва': [55.7558, 37.6176],
            'Санкт-Петербург': [59.9311, 30.3609],
            'Екатеринбург': [56.8431, 60.6454],
            'Новосибирск': [55.0084, 82.9357],
            'Нижний Новгород': [56.2965, 43.9361],
            'Казань': [55.8304, 49.0661],
            'Челябинск': [55.1644, 61.4368],
            'Омск': [54.9885, 73.3242],
            'Самара': [53.2001, 50.1500]
        };

        return cityCoords[cityName] || cityCoords['Москва'];
    }

    async loadCDEKOffices() {
        try {
            // Центрируем карту на текущем городе
            await this.centerMapOnCity(this.currentCity);

            // Загружаем пункты выдачи СДЭК через WordPress API
            const offices = await this.fetchCDEKOffices(this.currentCity);
            this.offices = offices;
            
            // Отображаем офисы на карте
            this.displayOfficesOnMap(offices);
            
            // Отображаем список офисов в боковой панели
            this.displayOfficesList(offices);
            
        } catch (error) {
            console.error('Ошибка загрузки пунктов выдачи:', error);
            this.showError('Не удалось загрузить пункты выдачи: ' + error.message);
        }
    }

    async centerMapOnCity(cityName) {
        try {
            const response = await ymaps.geocode(cityName);
            const firstGeoObject = response.geoObjects.get(0);
            if (firstGeoObject) {
                const coords = firstGeoObject.geometry.getCoordinates();
                this.map.setCenter(coords, 12);
            }
        } catch (error) {
            console.error('Ошибка геокодирования:', error);
        }
    }

    async fetchCDEKOffices(city) {
        try {
            const response = await fetch(this.apiUrl + 'offices', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-WP-Nonce': this.nonce
                },
                body: JSON.stringify({
                    city: city,
                    type: 'PVZ'
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Ошибка загрузки данных');
            }

            return await response.json();
        } catch (error) {
            console.error('Ошибка API СДЭК:', error);
            
            // Возвращаем тестовые данные для демонстрации
            return this.getTestOffices();
        }
    }

    getTestOffices() {
        // Тестовые данные для демонстрации (если API недоступен)
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

        if (offices.length === 0) {
            return;
        }

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
            listContainer.innerHTML = '<div class="cdek-no-offices">Пункты выдачи не найдены в данном городе</div>';
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

        // Показываем уведомление о выборе
        this.showNotification(`Выбран пункт выдачи: ${office.name}`);
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

        // Триггерим событие для обновления WooCommerce
        hiddenField.dispatchEvent(new Event('change', { bubbles: true }));
    }

    updateShippingMethods(office) {
        // Обновляем методы доставки в зависимости от выбранного офиса
        const shippingMethods = document.querySelectorAll('input[name="radio-control-1"]');
        
        shippingMethods.forEach(method => {
            const label = method.closest('label');
            const methodText = label.querySelector('.wc-block-components-radio-control__label').textContent;
            
            // Показываем только методы доставки до склада для выбранного офиса
            if (methodText.includes('склад-склад') || methodText.includes('дверь-склад') || methodText.includes('постамат-склад')) {
                label.style.display = 'block';
                label.style.opacity = '1';
            } else if (methodText.includes('дверь-дверь') || methodText.includes('склад-дверь') || methodText.includes('постамат-дверь')) {
                // Скрываем доставку до двери, так как выбран пункт выдачи
                label.style.opacity = '0.5';
                const note = label.querySelector('.delivery-note');
                if (!note) {
                    const noteElement = document.createElement('small');
                    noteElement.className = 'delivery-note';
                    noteElement.style.display = 'block';
                    noteElement.style.color = '#666';
                    noteElement.textContent = 'Недоступно при выборе пункта выдачи';
                    label.appendChild(noteElement);
                }
            }
        });

        // Автоматически выбираем самый дешевый метод доставки до склада
        const cheapestMethod = document.querySelector('input[value="cdek_shipping_136"]'); // Посылка склад-склад
        if (cheapestMethod && !cheapestMethod.checked) {
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
                    e.preventDefault();
                    this.searchCity(cityInput.value);
                }
            });
        }

        // Обработчики кнопок выбора офиса
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('cdek-select-office-btn')) {
                e.preventDefault();
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
                    document.getElementById('cdek-city-search').value = newCity;
                    this.loadCDEKOffices();
                }
            });
        }

        // Обработчик изменения способа доставки
        document.addEventListener('change', (e) => {
            if (e.target.name === 'radio-control-1') {
                const shippingContainer = document.querySelector('.wc-block-checkout__shipping-method');
                const deliveryOption = shippingContainer.querySelector('input[type="radio"]:checked');
                
                if (deliveryOption && deliveryOption.closest('[aria-checked="true"]')) {
                    const titleElement = deliveryOption.closest('.wc-block-checkout__shipping-method-option').querySelector('.wc-block-checkout__shipping-method-option-title');
                    
                    if (titleElement && titleElement.textContent === 'Самовывоз') {
                        // Показываем карту только при выборе самовывоза
                        document.querySelector('.wp-block-cdek-checkout-map-block').style.display = 'block';
                    } else {
                        // Скрываем карту при выборе доставки
                        document.querySelector('.wp-block-cdek-checkout-map-block').style.display = 'none';
                    }
                }
            }
        });
    }

    async searchCity(cityName) {
        if (!cityName.trim()) return;

        this.currentCity = cityName;
        document.querySelector('.cdek-offices-list').innerHTML = '<div class="cdek-loading">Загрузка пунктов выдачи...</div>';
        
        // Сбрасываем выбранный офис
        this.selectedOffice = null;
        document.querySelector('.cdek-selected-office').style.display = 'none';
        
        await this.loadCDEKOffices();
    }

    extractCityFromAddress(address) {
        // Простое извлечение города из адреса
        const parts = address.split(',');
        return parts[0].trim();
    }

    showError(message) {
        const listContainer = document.querySelector('.cdek-offices-list');
        listContainer.innerHTML = `
            <div class="cdek-error">
                ${message}
                <br><br>
                <button type="button" onclick="location.reload()">Попробовать снова</button>
            </div>
        `;
    }

    showNotification(message) {
        // Создаем временное уведомление
        const notification = document.createElement('div');
        notification.className = 'cdek-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4caf50;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 10000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;

        document.body.appendChild(notification);

        // Удаляем уведомление через 3 секунды
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
}

// Инициализируем карту после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    // Проверяем, что мы на странице checkout и есть контейнер для карты
    if (document.querySelector('.wp-block-cdek-checkout-map-block') && typeof cdekMapData !== 'undefined') {
        new CDEKMapIntegration();
    }
});