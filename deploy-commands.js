require("dotenv").config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;


const commands = [
new SlashCommandBuilder()
  .setName('editar_horas')
  .setDescription('Editar horas de un empleado')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // 👈 SOLO ADMINS
  .addStringOption(option =>
    option.setName('nombre')
      .setDescription('Nombre del empleado')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('horas')
      .setDescription('Horas')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('minutos')
      .setDescription('Minutos')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('operacion')
      .setDescription('sumar | restar | reemplazar')
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName('crear_empleado')
    .setDescription('Crea un hilo de turnos para un empleado')
    .addStringOption(option =>
      option.setName('nombre')
        .setDescription('Nombre del empleado')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('horas_totales')
    .setDescription('Muestra las horas totales de un empleado')
    .addStringOption(option =>
      option.setName('nombre')
        .setDescription('Nombre del empleado')
        .setRequired(true)
    ),
      new SlashCommandBuilder()
    .setName('resetear_ganancia')
    .setDescription('Reinicia la ganancia de un empleado a 0')
    .addStringOption(option =>
      option
        .setName('nombre')
        .setDescription('Nombre del empleado')
        .setRequired(true)
    ),
    new SlashCommandBuilder()
  .setName('registro')
  .setDescription('Muestra todos los turnos de un empleado')
  .addStringOption(option =>
    option.setName('nombre')
      .setDescription('Nombre del empleado')
      .setRequired(true)
  ),
new SlashCommandBuilder()
  .setName('quien_esta_en_turno')
  .setDescription('Muestra quién está actualmente en turno'),

new SlashCommandBuilder()
  .setName("convenio_cargar")
  .setDescription("Carga o recarga el saldo de un convenio")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(option =>
    option.setName("convenio")
      .setDescription("Nombre del convenio")
      .setRequired(true)
      .addChoices(
        { name: "PDLC", value: "pdlc" },
        { name: "PBA", value: "pba" },
      )
  )
  .addIntegerOption(option =>
    option.setName("monto")
      .setDescription("Monto a cargar")
      .setRequired(true)
  ),

new SlashCommandBuilder()
  .setName("convenio_ver")
  .setDescription("Ver el saldo de un convenio")
  .addStringOption(option =>
    option.setName("convenio")
      .setDescription("Nombre del convenio")
      .setRequired(true)
      .addChoices(
        { name: "PDLC", value: "pdlc" },
        { name: "PBA", value: "pba" },
      )
  ),

new SlashCommandBuilder()
  .setName("crear_canje")
  .setDescription("Crea un código de canje")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(option =>
    option.setName("premio")
      .setDescription("Premio del código")
      .setRequired(true)
      .addChoices(
        { name: "Combos x5",     value: "Combos x5" },
        { name: "Combos x10",    value: "Combos x10" },
        { name: "Combos x20",    value: "Combos x20" },
        { name: "Cajitas uwu x3", value: "Cajitas uwu x3" },
      )
  ),

new SlashCommandBuilder()
  .setName("ver_canjes")
  .setDescription("Ver todos los códigos de canje activos")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),


  new SlashCommandBuilder()
  .setName("registros_borrar")
  .setDescription("🧾 Borra todo el historial de turnos")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

new SlashCommandBuilder()
  .setName("terminar_turno")
  .setDescription("🔴 Fuerza el cierre del turno activo de un empleado")
  .addStringOption(option =>
    option
      .setName("nombre")
      .setDescription("Nombre del empleado")
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
  .setName('resetear_ranking')
  .setDescription('Reinicia todas las horas del ranking'),

  new SlashCommandBuilder()
  .setName('mi_ganancia')
  .setDescription('Muestra tu ganancia acumulada'),

new SlashCommandBuilder()
  .setName('ganancias_totales')
  .setDescription('Muestra las ganancias totales (admin)'),
new SlashCommandBuilder()
  .setName('editar_ganancia')
  .setDescription('Editar ganancia de un empleado')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // 👈 SOLO ADMINS
  .addStringOption(option =>
    option.setName('nombre')
      .setDescription('Empleado')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('operacion')
      .setDescription('sumar | restar | resetear')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('monto')
      .setDescription('Monto (no necesario para resetear)')
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Muestra el ranking de empleados')
].map(cmd => cmd.toJSON());
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('🚀 Registrando comandos...');

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log('✅ Comandos registrados correctamente.');
  } catch (error) {
    console.error(error);
  }
})();
