// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract EdgeDeviceControl {

    // Структури для збереження історії
    struct KettleReading {
        uint256 temperature;
        uint256 timestamp;
    }

    struct KettleAction {
        address sender;
        uint256 timestamp;
    }

    struct LockStatus {
        bool isLocked;
        uint256 timestamp;
    }

    // Массиви для збереження історії
    KettleReading[] public kettleReadings;
    KettleAction[] public kettleActions;
    LockStatus[] public lockStatuses;

    // Адміністратор
    address public admin;

    // Події
    event KettleTemperatureSent(uint256 temperature, uint256 timestamp);
    event KettleTurnedOn(address indexed sender, uint256 timestamp);
    event LockStatusChanged(bool newStatus, uint256 timestamp);

    // Модифікатор для перевірки доступу
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    modifier onlyAuthorized(address _user) {
        require(authorizedUsers[_user] == true, "You are not authorized to interact with this contract");
        _;
    }

    // Мапа для авторизованих користувачів
    mapping(address => bool) public authorizedUsers;

    // Конструктор для встановлення адміністратора
    constructor() {
        admin = msg.sender;
    }

    // Функція для додавання користувача до списку авторизованих
    function grantAccess(address _user) public onlyAdmin {
        authorizedUsers[_user] = true;
    }

    // Функція для видалення користувача з авторизованих
    function revokeAccess(address _user) public onlyAdmin {
        authorizedUsers[_user] = false;
    }

    // Функція для надсилання температури чайника
    function sendKettleTemperature(uint256 temperature) public onlyAuthorized(msg.sender) {
        kettleReadings.push(KettleReading(temperature, block.timestamp));
        emit KettleTemperatureSent(temperature, block.timestamp);
    }

    // Функція для вмикання чайника
    function turnOnKettle() public onlyAuthorized(msg.sender) {
        kettleActions.push(KettleAction(msg.sender, block.timestamp));
        emit KettleTurnedOn(msg.sender, block.timestamp);
    }

    // Функція для отримання кількості температурних записів
    function getKettleReadingsCount() public view returns (uint256) {
        return kettleReadings.length;
    }

    // Функція для отримання температури за індексом
    function getKettleReading(uint256 index) public view returns (uint256, uint256) {
        require(index < kettleReadings.length, "Index out of bounds");
        KettleReading memory reading = kettleReadings[index];
        return (reading.temperature, reading.timestamp);
    }

    // Функція для зміни стану дверного замка
    function updateDoorLockState(bool newState) public onlyAuthorized(msg.sender) {
        lockStatuses.push(LockStatus(newState, block.timestamp));
        emit LockStatusChanged(newState, block.timestamp);
    }

    // Функція для отримання кількості записів замка
    function getLockStatusCount() public view returns (uint256) {
        return lockStatuses.length;
    }

    // Функція для отримання стану замка
    function getLockStatus(uint256 index) public view returns (bool, uint256) {
        require(index < lockStatuses.length, "Index out of bounds");
        LockStatus memory status = lockStatuses[index];
        return (status.isLocked, status.timestamp);
    }

    // Функція для отримання кількості дій з чайником
    function getKettleActionsCount() public view returns (uint256) {
        return kettleActions.length;
    }

    // Функція для отримання дії з чайником
    function getKettleAction(uint256 index) public view returns (address, uint256) {
        require(index < kettleActions.length, "Index out of bounds");
        KettleAction memory action = kettleActions[index];
        return (action.sender, action.timestamp);
    }
}
