with import <nixpkgs> { };

mkShell {
  nativeBuildInputs = [
    direnv
    nodejs_22
  ];

  NIX_ENFORCE_PURITY = true;

  shellHook = ''
  '';
}
