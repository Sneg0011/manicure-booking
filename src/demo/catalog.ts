export const demoMasters = [
  {
    id: 1,
    name: 'Дарья Соколова',
    bio: 'Специализируется на аккуратном маникюре и уходе за ногтями.',
    photo: null,
    sort: 1,
  },
  {
    id: 2,
    name: 'Милана Орлова',
    bio: 'Выполняет маникюр, педикюр и наращивание ногтей.',
    photo: null,
    sort: 2,
  },
] as const;

export const demoServices = [
  {
    name: 'Маникюр без покрытия',
    description: 'Обработка ногтей и кутикулы без нанесения покрытия.',
    durationMin: 45,
    bufferMin: 15,
    priceRub: 1400,
  },
  {
    name: 'Маникюр с покрытием',
    description: 'Маникюр и нанесение однотонного покрытия.',
    durationMin: 105,
    bufferMin: 15,
    priceRub: 2600,
  },
  {
    name: 'Снятие и новое покрытие',
    description: 'Снятие старого покрытия, маникюр и новое покрытие.',
    durationMin: 135,
    bufferMin: 15,
    priceRub: 3000,
  },
  {
    name: 'Наращивание',
    description: 'Наращивание ногтей с обработкой формы.',
    durationMin: 165,
    bufferMin: 15,
    priceRub: 4200,
  },
  {
    name: 'Ремонт одного ногтя',
    description: 'Восстановление одного повреждённого ногтя.',
    durationMin: 15,
    bufferMin: 15,
    priceRub: 400,
  },
  {
    name: 'Педикюр с покрытием',
    description: 'Обработка стоп и ногтей с нанесением покрытия.',
    durationMin: 105,
    bufferMin: 15,
    priceRub: 3400,
  },
] as const;
