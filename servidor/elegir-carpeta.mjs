// Abre el selector de carpetas del sistema en el equipo de la oficina y devuelve la ruta elegida.
// Lo abre el servidor porque un navegador, por seguridad, no le da a la página la ruta real de una
// carpeta. Por eso solo tiene sentido desde este equipo: por el túnel se abriría aquí, no allá.
import { execFile } from 'node:child_process';
import { enElPath, ES_WINDOWS } from './plataforma.mjs';

const LIMITE_MS = 10 * 60e3;

// El explorador moderno de Windows (IFileOpenDialog); si fallara, el selector clásico. La ruta sale
// en base64 para que acentos y eñes no dependan de la codificación de la consola.
const SCRIPT_WINDOWS = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class DialogoAbrir {}
[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IElemento {
  void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
  void GetParent(out IElemento ppsi);
  void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string nombre);
  void GetAttributes(uint mask, out uint attrs);
  void Compare(IElemento psi, uint hint, out int orden);
}
[ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDialogo {
  [PreserveSig] int Show(IntPtr padre);
  void SetFileTypes(uint n, IntPtr tipos);
  void SetFileTypeIndex(uint i);
  void GetFileTypeIndex(out uint i);
  void Advise(IntPtr pfde, out uint cookie);
  void Unadvise(uint cookie);
  void SetOptions(uint fos);
  void GetOptions(out uint fos);
  void SetDefaultFolder(IElemento psi);
  void SetFolder(IElemento psi);
  void GetFolder(out IElemento psi);
  void GetCurrentSelection(out IElemento psi);
  void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string nombre);
  void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string nombre);
  void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string titulo);
  void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string texto);
  void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string texto);
  void GetResult(out IElemento psi);
}
public static class Selector {
  public static string Elegir(IntPtr padre, string titulo) {
    IDialogo d = (IDialogo)new DialogoAbrir();
    uint o; d.GetOptions(out o);
    d.SetOptions(o | 0x20 | 0x40); // solo carpetas, solo del sistema de archivos
    d.SetTitle(titulo);
    d.SetOkButtonLabel("Elegir esta carpeta");
    int r = d.Show(padre);
    if (r == unchecked((int)0x800704C7)) return "";
    Marshal.ThrowExceptionForHR(r);
    IElemento e; d.GetResult(out e);
    string ruta; e.GetDisplayName(0x80058000, out ruta);
    return ruta;
  }
}
'@
# Ventana invisible siempre encima: así el explorador no se abre detrás del navegador.
$f = New-Object System.Windows.Forms.Form
$f.TopMost = $true; $f.ShowInTaskbar = $false; $f.Opacity = 0; $f.FormBorderStyle = 'None'
$f.StartPosition = 'CenterScreen'; $f.Size = New-Object System.Drawing.Size(1,1)
$f.Show(); $f.Activate()
$titulo = 'Elige la carpeta del repositorio'
try { $ruta = [Selector]::Elegir($f.Handle, $titulo) }
catch {
  $c = New-Object System.Windows.Forms.FolderBrowserDialog
  $c.Description = $titulo
  $ruta = if ($c.ShowDialog($f) -eq 'OK') { $c.SelectedPath } else { '' }
}
$f.Close()
[Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($ruta)))
`;

const ejecutarReal = (bin, args) => new Promise((resolver) => {
  execFile(bin, args, { timeout: LIMITE_MS, windowsHide: true, encoding: 'utf8', maxBuffer: 1 << 20 }, (e, stdout, stderr) => {
    resolver({ codigo: e ? (typeof e.code === 'number' ? e.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), fallo: e && typeof e.code !== 'number' ? e : null });
  });
});

export function crearSelectorCarpeta({ esWindows = ES_WINDOWS, ejecutar = ejecutarReal, buscar = enElPath, entorno = process.env } = {}) {
  let abierto = false;

  async function enWindows() {
    const r = await ejecutar('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(SCRIPT_WINDOWS, 'utf16le').toString('base64')]);
    if (r.codigo !== 0 || r.fallo) throw Object.assign(new Error('No se pudo abrir el explorador. Escribe la ruta de la carpeta.'), { codigo: 500 });
    return Buffer.from(r.stdout.trim(), 'base64').toString('utf8');
  }

  async function enLinux() {
    const sinEscritorio = () => Object.assign(new Error('Este equipo no tiene un selector de carpetas disponible. Escribe la ruta de la carpeta.'), { codigo: 501 });
    if (!entorno.DISPLAY && !entorno.WAYLAND_DISPLAY) throw sinEscritorio();
    const titulo = 'Elige la carpeta del repositorio';
    const zenity = buscar('zenity');
    const kdialog = zenity ? null : buscar('kdialog');
    if (!zenity && !kdialog) throw sinEscritorio();
    const r = zenity
      ? await ejecutar(zenity, ['--file-selection', '--directory', `--title=${titulo}`])
      : await ejecutar(kdialog, ['--getexistingdirectory', entorno.HOME || '/', '--title', titulo]);
    // Ambos salen con 1 y sin texto al cancelar.
    if (r.codigo === 1 && !r.stdout.trim()) return '';
    if (r.codigo !== 0 || r.fallo) throw sinEscritorio();
    return r.stdout.replace(/\r?\n$/, '');
  }

  /** La ruta elegida, o '' si se canceló. Solo una ventana a la vez. */
  return async function elegir() {
    if (abierto) throw Object.assign(new Error('Ya hay una ventana abierta para elegir la carpeta: búscala en tu escritorio.'), { codigo: 409 });
    abierto = true;
    try { return await (esWindows ? enWindows() : enLinux()); } finally { abierto = false; }
  };
}
