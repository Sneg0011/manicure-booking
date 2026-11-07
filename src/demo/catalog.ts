export const demoMasters = [
  {
    id: 1,
    name: 'Дарья Соколова',
    bio: 'Специализируется на аккуратном маникюре и уходе за ногтями.',
    photo: '/photos/master-daria.jpg',
    sort: 1,
  },
  {
    id: 2,
    name: 'Милана Орлова',
    bio: 'Выполняет маникюр, педикюр и наращивание ногтей.',
    photo: '/photos/master-milana.jpg',
    sort: 2,
  },
] as const;

export const demoServices = [
  {
    name: 'Без покрытия',
    category: 'Маникюр',
    description: 'Снятие старого покрытия, обработка кутикулы, форма',
    durationMin: 45,
    bufferMin: 15,
    priceRub: 1400,
  },
  {
    name: 'С покрытием',
    category: 'Маникюр',
    description: 'Маникюр, укрепление, покрытие гель-лаком',
    durationMin: 105,
    bufferMin: 15,
    priceRub: 2600,
  },
  {
    name: 'Снятие и новое покрытие',
    category: 'Маникюр',
    description: 'Снятие, выравнивание, покрытие на ваши ногти',
    durationMin: 135,
    bufferMin: 15,
    priceRub: 3000,
  },
  {
    name: 'Наращивание',
    category: 'Маникюр',
    description: 'Гелевое наращивание длины, форма и покрытие',
    durationMin: 165,
    bufferMin: 15,
    priceRub: 4200,
  },
  {
    name: 'Ремонт одного ногтя',
    category: 'Ремонт',
    description: 'Восстановление формы и покрытия одного ногтя',
    durationMin: 15,
    bufferMin: 15,
    priceRub: 400,
  },
  {
    name: 'Педикюр с покрытием',
    category: 'Педикюр',
    description: 'Обработка стоп и ногтей, покрытие гель-лаком',
    durationMin: 105,
    bufferMin: 15,
    priceRub: 3400,
  },
] as const;
