package packs

import (
	"regexp"
	"slices"
	"testing"
)

func TestNamesInPresetOrder(t *testing.T) {
	want := []string{"classic", "crt", "cozy", "arcade"}
	if got := Names(); !slices.Equal(got, want) {
		t.Fatalf("Names() = %v, want %v", got, want)
	}
}

func TestByName(t *testing.T) {
	p, ok := ByName("crt")
	if !ok {
		t.Fatal("crt missing")
	}
	if p.Bg != "#040a05" || p.Colors.Text != "#33ff66" || p.Spinner.ID != "comet" {
		t.Fatalf("crt = bg %s text %s spinner %s", p.Bg, p.Colors.Text, p.Spinner.ID)
	}
	if _, ok := ByName("nope"); ok {
		t.Fatal("ByName(nope) found a pack")
	}
}

func TestEveryPackIsComplete(t *testing.T) {
	hex := regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	for _, p := range All() {
		c := p.Colors
		for _, v := range []string{p.Bg, p.BorderColor, c.Accent, c.Text, c.Dim, c.Faint, c.Read, c.Edit, c.Shell, c.Agent, c.Pass, c.Fail} {
			if !hex.MatchString(v) {
				t.Errorf("%s: color %q is not #rrggbb", p.Name, v)
			}
		}
		if _, ok := SpinnerByID(p.Spinner.ID); !ok || p.Spinner.Word == "" {
			t.Errorf("%s: spinner %q or its word is missing", p.Name, p.Spinner.ID)
		}
		if p.Spinner.Color != "" && !hex.MatchString(p.Spinner.Color) {
			t.Errorf("%s: spinner color %q is not #rrggbb", p.Name, p.Spinner.Color)
		}
	}
}

func TestThemesSpinnersAndClawd(t *testing.T) {
	want := []string{"classic", "glowup", "aurora", "dusk", "cyberpunk", "vaporwave", "high-contrast"}
	if got := ThemeNames(); !slices.Equal(got, want) {
		t.Fatalf("ThemeNames() = %v, want %v", got, want)
	}
	if d, ok := ThemeByName("dusk"); !ok || d.Colors.Accent != "#b69cff" || d.Colors.Panel == "" {
		t.Fatalf("dusk = %+v", d)
	}
	if want := []string{"stock", "comet", "eyes", "orb-states", "clawd", "shimmer", "scanline", "ring", "glitch", "signal"}; !slices.Equal(SpinnerIDs(), want) {
		t.Fatalf("SpinnerIDs() = %v, want %v", SpinnerIDs(), want)
	}
	for _, s := range Spinners() {
		if len(s.Frames) == 0 || s.Ms <= 0 {
			t.Errorf("spinner %s has no frames or no frame time", s.ID)
		}
		for _, f := range s.Frames {
			if len(f) == 0 || len(f[0]) == 0 {
				t.Errorf("spinner %s has an empty frame", s.ID)
			}
		}
	}
	c := ClawdSprite()
	if len(c.Rows) != 6 || c.Cols != 24 {
		t.Fatalf("Clawd is %d rows of %d cells", len(c.Rows), c.Cols)
	}
}

func TestCatalog(t *testing.T) {
	if len(Catalog()) == 0 {
		t.Fatal("the catalog is empty")
	}
	for _, e := range Catalog() {
		if e.Name == "" || e.Description == "" {
			t.Errorf("incomplete catalog entry %+v", e)
		}
		if !InCatalog(e.Name) || !Known(e.Name) {
			t.Errorf("%s is not found as a catalog pack", e.Name)
		}
	}
	if InCatalog("classic") || InCatalog("nosuch") {
		t.Error("InCatalog accepts a built-in or an unknown name")
	}
	if !Known("classic") || !Known("oxide") || Known("nosuch") {
		t.Error("Known should accept built-ins and catalog names only")
	}
	if slices.Contains(Names(), "oxide") {
		t.Error("Names() lists a catalog pack")
	}
}

func TestAllReturnsACopy(t *testing.T) {
	a := All()
	a[0].Name = "changed"
	if Names()[0] != "classic" {
		t.Fatal("All() exposed the package slice")
	}
}
